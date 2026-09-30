import { useEffect, useState } from 'react';
import { nextSequence, saveNote } from '../lib/db';
import { prepareImage } from '../lib/image';
import { formatNoteNumber, emptyInvoice } from '../lib/note';
import { newId } from '../lib/id';
import { recognize } from '../lib/ocr';
import { parseInvoiceText } from '../lib/parse';
import { saveSettings, useSettings } from '../lib/settings';
import { requestSync } from '../lib/sync';
import type { DeliveryNote, InvoiceData } from '../lib/types';
import { CaptureStep } from './CaptureStep';
import { NoteView } from './NoteView';
import { ReviewForm, type ReviewValues } from './ReviewForm';
import { Button, Card } from './ui';
import { SpinnerIcon } from './Icons';

type Step =
  | { kind: 'capture'; error?: string }
  | { kind: 'processing'; preview?: string; label: string; progress: number }
  | { kind: 'review'; invoice: InvoiceData; thumbnail?: string; dateAmbiguous: boolean; confidence?: number }
  | { kind: 'note'; noteId: string };

const STAGE_LABELS: Record<string, string> = {
  'loading tesseract core': 'Loading the reading engine',
  'initializing tesseract': 'Starting the reading engine',
  'loading language traineddata': 'Loading language data',
  'initializing api': 'Getting ready',
  'recognizing text': 'Reading the invoice',
};

interface Props {
  notes: DeliveryNote[];
}

export function ScanFlow({ notes }: Props) {
  const settings = useSettings();
  const [step, setStep] = useState<Step>({ kind: 'capture' });
  const [saving, setSaving] = useState(false);

  // Every new step starts at the top of the page (the review form is long; don't land mid-scroll).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step.kind]);

  const start = () => setStep({ kind: 'capture' });

  async function handleImage(blob: Blob) {
    setStep({ kind: 'processing', label: 'Preparing the image', progress: 0.02 });
    try {
      const prepared = await prepareImage(blob);
      setStep({ kind: 'processing', preview: prepared.preview, label: 'Preparing the image', progress: 0.05 });
      const result = await recognize(prepared.canvas, (p) =>
        setStep((s) =>
          s.kind === 'processing'
            ? {
                ...s,
                label: STAGE_LABELS[p.status] ?? 'Working',
                // The reading itself is the long part: map it onto the last 80% of the bar.
                progress: p.status === 'recognizing text' ? 0.2 + p.progress * 0.8 : Math.max(s.progress, 0.05 + p.progress * 0.15),
              }
            : s,
        ),
      );
      const parsed = parseInvoiceText(result.text);
      setStep({
        kind: 'review',
        invoice: parsed.invoice,
        thumbnail: prepared.thumbnail,
        dateAmbiguous: parsed.dateAmbiguous,
        confidence: result.confidence,
      });
    } catch (err) {
      console.error(err);
      setStep({
        kind: 'capture',
        error: `Couldn't read that image (${err instanceof Error ? err.message : 'unknown error'}). Try a clearer photo, or type it in manually.`,
      });
    }
  }

  async function handleSample() {
    try {
      const res = await fetch(new URL(import.meta.env.BASE_URL + 'samples/invoice-01.png', document.baseURI));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await handleImage(await res.blob());
    } catch (err) {
      setStep({ kind: 'capture', error: `Couldn't load the sample (${err instanceof Error ? err.message : 'error'}).` });
    }
  }

  async function confirm(v: ReviewValues) {
    if (step.kind !== 'review') return;
    setSaving(true);
    try {
      const now = new Date();
      const seq = await nextSequence();
      const note: DeliveryNote = {
        id: newId(),
        noteNumber: formatNoteNumber(now, seq),
        createdAt: now.toISOString(),
        receivedBy: v.receivedBy.trim(),
        location: v.location.trim(),
        remarks: v.remarks,
        invoice: v.invoice,
        status: 'pending',
        attempts: 0,
        thumbnail: step.thumbnail,
      };
      await saveNote(note);
      // Remember who/where for next time - frontline staff should not retype this every delivery.
      saveSettings({ receivedBy: note.receivedBy, location: note.location });
      requestSync();
      setStep({ kind: 'note', noteId: note.id });
    } finally {
      setSaving(false);
    }
  }

  if (step.kind === 'capture') {
    return (
      <CaptureStep
        error={step.error}
        onImage={(b) => void handleImage(b)}
        onSample={() => void handleSample()}
        onManual={() => setStep({ kind: 'review', invoice: emptyInvoice(), dateAmbiguous: false })}
      />
    );
  }

  if (step.kind === 'processing') {
    return (
      <Card className="flex flex-col items-center gap-4 py-6 text-center">
        {step.preview && <img src={step.preview} alt="Invoice being read" className="max-h-64 rounded-lg border border-slate-200 object-contain" />}
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700" role="status" data-testid="ocr-status">
          <SpinnerIcon /> {step.label}…
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(step.progress * 100)}
          className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-200"
        >
          <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${Math.round(step.progress * 100)}%` }} />
        </div>
        <p className="text-xs text-slate-500">Nothing leaves this device while it reads.</p>
        <Button variant="ghost" onClick={start}>
          Cancel
        </Button>
      </Card>
    );
  }

  if (step.kind === 'review') {
    return (
      <ReviewForm
        initial={step.invoice}
        thumbnail={step.thumbnail}
        dateAmbiguous={step.dateAmbiguous}
        ocrConfidence={step.confidence}
        defaults={{ receivedBy: settings.receivedBy, location: settings.location }}
        currency={settings.currency}
        busy={saving}
        onCancel={start}
        onConfirm={(v) => void confirm(v)}
      />
    );
  }

  const note = notes.find((n) => n.id === step.noteId);
  if (!note) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Saving…</p>
      </Card>
    );
  }
  return <NoteView note={note} currency={settings.currency} onNew={start} />;
}
