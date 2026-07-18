// Tokara_V_Required.json carries one feature per physical sub-parcel, and some
// blocks are split across more than one - sum them to get each block's total
// required irrigation volume.
export function sumVRequiredByBlock(vRequiredGeojson) {
  const map = {};
  (vRequiredGeojson?.features || []).forEach(f => {
    const block = f.properties?.BLOCK;
    const volume = f.properties?.V_Required_m3;
    if (block == null || typeof volume !== 'number') return;
    map[block] = (map[block] || 0) + volume;
  });
  return map;
}
