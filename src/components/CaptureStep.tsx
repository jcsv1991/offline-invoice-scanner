import { useRef, useState, type DragEvent } from 'react';
import { CameraIcon, PlusIcon } from './Icons';
import { Button, Card } from './ui';

interface Props {
  onImage: (file: Blob) => void;
  onSample: () => void;
  onManual: () => void;
  error?: string | null;
}

export function CaptureStep({ onImage, onSample, onManual, error }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onImage(f);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  };

  return (
    <div className="flex flex-col gap-4">
      <Card
        className={`flex flex-col items-center gap-4 py-8 text-center ${dragging ? 'border-teal-500 bg-teal-50' : ''}`}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="flex w-full flex-col items-center gap-4"
        >
          <div className="rounded-full bg-teal-50 p-4 text-teal-700">
            <CameraIcon width={36} height={36} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Scan a paper invoice</h2>
            <p className="mt-1 max-w-sm text-sm text-slate-600">
              Point the camera at the invoice. Reading happens on this phone, so it works with no signal.
            </p>
          </div>

          <input
            ref={camera}
            data-testid="camera-input"
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />
          <input
            ref={gallery}
            data-testid="file-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex w-full max-w-xs flex-col gap-2">
            <Button variant="primary" className="min-h-12 text-base" onClick={() => camera.current?.click()}>
              <CameraIcon /> Take photo
            </Button>
            <Button onClick={() => gallery.current?.click()}>Choose an image</Button>
          </div>
          <p className="hidden text-xs text-slate-500 sm:block">…or drop an image here</p>
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-700">No invoice handy?</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button data-testid="try-sample" onClick={onSample} className="flex-1">
            Try a sample invoice
          </Button>
          <Button data-testid="manual-entry" variant="ghost" onClick={onManual} className="flex-1">
            <PlusIcon /> Type it in manually
          </Button>
        </div>
      </Card>
    </div>
  );
}
