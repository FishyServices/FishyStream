import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { FileVideo, Upload } from "lucide-react";
import { Button, Input } from "@fishy/ui";

const LOCAL_VIDEO_ACCEPT = "video/*,.mkv,.mp4,.webm,.mov,.m4v,.avi,.wmv,.flv,.ts";

function isVideoFile(file: File) {
  return (
    file.type.startsWith("video/") || /\.(mkv|mp4|webm|mov|m4v|avi|wmv|flv|ts)$/i.test(file.name)
  );
}

export function LocalFilePicker() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const openFile = (file: File | undefined) => {
    if (!file) return;
    if (!isVideoFile(file)) {
      setError("Choose a video file such as MP4, WebM, MOV, or MKV.");
      return;
    }
    navigate("/watch/local", { state: { file } });
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    openFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    openFile(event.dataTransfer.files[0]);
  };

  return (
    <div
      className="page-shell-wide py-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex flex-col gap-3 border-y border-border/55 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <FileVideo className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-display text-sm font-semibold text-foreground">
              Watch a file from this device
            </p>
            {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
          </div>
        </div>
        <Input
          ref={inputRef}
          type="file"
          accept={LOCAL_VIDEO_ACCEPT}
          onChange={handleChange}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <Button
          variant="outline"
          className="shrink-0 rounded-lg"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          Open video file
        </Button>
      </div>
    </div>
  );
}
