export const PAPER_SIZES = [
  {
    id: 'long',
    value: 'Long (8.5 × 13 inches)',
    name: 'Long',
    dimensions: '8.5 × 13 inches',
  },
  {
    id: 'short',
    value: 'Short (8.5 × 11 inches)',
    name: 'Short',
    dimensions: '8.5 × 11 inches',
  },
  {
    id: 'a4',
    value: 'A4 (210 × 297 mm)',
    name: 'A4',
    dimensions: '210 × 297 mm',
  },
];

export const PRINT_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'photo', label: 'Photo Print' },
  { value: 'thick', label: 'Thick Paper' },
  { value: 'legal', label: 'Legal Size' },
];

export const formatPaperSize = (paperSize) => {
  if (!paperSize) return 'Short (8.5 × 11 inches)';
  const match = PAPER_SIZES.find(
    (ps) =>
      ps.value === paperSize ||
      ps.id === String(paperSize).toLowerCase() ||
      ps.name.toLowerCase() === String(paperSize).toLowerCase()
  );
  return match ? match.value : paperSize;
};
