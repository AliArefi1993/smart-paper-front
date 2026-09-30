async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function shareOrDownloadFile(filename: string, mimeType: string, content: BlobPart): Promise<"shared" | "downloaded"> {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const { Capacitor } = await import("@capacitor/core");

  if (Capacitor.isNativePlatform()) {
    const [{ Directory, Filesystem }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const savedFile = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: filename,
      text: filename,
      url: savedFile.uri,
      dialogTitle: filename,
    });
    return "shared";
  }

  const file = new File([blob], filename, { type: mimeType });
  const shareData = { files: [file], title: filename };
  if (navigator.canShare?.(shareData)) {
    await navigator.share(shareData);
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}
