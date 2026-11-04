/** Values that mirror the backend's allowed values (models.py). */
export const TREK_DIFFICULTIES = ['Easy', 'Moderate', 'Hard'];
export const TREK_STATUSES = ['Pending', 'Approved', 'Open', 'Closed', 'Ongoing', 'Completed'];

/** Duration filter -> min_days / max_days query params */
export const DURATIONS = [
  { value: '', label: 'Duration: Any' },
  { value: '1-5', label: 'Up to 5 days', min: 1, max: 5 },
  { value: '6-8', label: '6–8 days', min: 6, max: 8 },
  { value: '9-', label: '9+ days', min: 9 },
];
