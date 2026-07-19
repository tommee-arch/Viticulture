// Tokara_Pheno_Data.csv stores stage-transition dates as US-format strings (M/D/YYYY).
export function parseUsDate(str) {
  if (!str) return null;
  const [m, d, y] = String(str).split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d);
}

export const GROWTH_STAGES = ['Budbreak', 'Flowering', 'PreVeraison', 'Harvest'];

// Which growth stage a block is in as of `date`, from its phenology record
// for the relevant season - each stage's transition date is checked in
// chronological order, so the last one that's passed wins. There's no
// Leafdrop date in the dataset, so "Harvest" is as far as this resolves.
export function deriveGrowthStage(date, pheno) {
  if (!date || !pheno) return 'Unknown';
  const d = new Date(date);
  let stage = 'Pre-Budbreak';
  GROWTH_STAGES.forEach(s => {
    const stageDate = parseUsDate(pheno[s]);
    if (stageDate && d >= stageDate) stage = s;
  });
  return stage;
}
