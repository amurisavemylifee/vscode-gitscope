/** Размер файла для человека. `undefined` означает, что файла на этой стороне нет. */
export function formatBytes(size: number | undefined): string {
  if (size === undefined) {
    return 'нет файла';
  }
  if (size < 1024) {
    return `${size} Б`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} КБ`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}
