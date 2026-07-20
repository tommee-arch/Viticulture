import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

// L.Control.Layers has no ordering API - it lists overlays in whatever order
// each one happens to register with it, which isn't reliably tied to JSX
// order (e.g. an overlay rendered inside a <Pane> registers a render tick
// later than a plain sibling, and that gap isn't consistent run to run).
// This reorders the actual DOM rows to match `order` (overlay names, top to
// bottom) any time the list's contents change, converging on the requested
// order regardless of Leaflet's internal insertion timing.
export default function OrderedOverlaysControl({ order }) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const controlRoot = container.querySelector('.leaflet-control-layers');
    if (!controlRoot) return undefined;

    const applyOrder = () => {
      const list = controlRoot.querySelector('.leaflet-control-layers-overlays');
      if (!list) return;
      const rows = [...list.children];
      const wanted = order
        .map(name => rows.find(r => r.textContent.trim() === name))
        .filter(Boolean);
      // Bail out if the list is already in the wanted order - appendChild
      // still fires a childList mutation even when a node doesn't actually
      // move, so skipping the no-op case is what keeps the observer below
      // from re-triggering itself forever.
      const alreadyInOrder = wanted.every((row, i) => rows[i] === row);
      if (alreadyInOrder) return;
      wanted.forEach(row => list.appendChild(row));
    };

    applyOrder();
    const observer = new MutationObserver(applyOrder);
    observer.observe(controlRoot, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [map, order]);

  return null;
}
