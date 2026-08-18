/**
 * District geometry, in MEDIA IMAGE coordinates: u right, v DOWN from the top-left
 * of the 16:9 plate. These are valid only because the hero shot is locked — the
 * camera never moves across the 226 frames, so a point on the plate is a point on
 * the city, forever.
 *
 * Each plot is an isometric diamond: |du|/hw + |dv|/hh <= 1. A diamond (not a box)
 * because every parcel in the render sits on the same 2:1 iso grid, so a diamond
 * hugs the actual block instead of spilling into the road.
 *
 * `lift` raises the label above the plot so it clears the buildings standing on it
 * — downtown needs a lot, the marina needs almost none.
 *
 * Verify/retune any time with ?debug — it draws these diamonds over the footage.
 */
export const DISTRICTS = [
  {
    id: 'downtown',
    name: 'Downtown',
    eyebrow: 'Core',
    u: 0.505, v: 0.455, hw: 0.085, hh: 0.070, lift: 0.105,
    body: 'Eleven towers on four blocks. Everything in Metro is measured as a distance from this intersection, including the parts of town that would rather not be.',
    stats: [['Towers', '11'], ['Floor area', '1.4M m²'], ['Daytime pop.', '48,000']],
  },
  {
    id: 'greenbelt',
    name: 'The Greenbelt',
    eyebrow: 'Parks',
    u: 0.335, v: 0.435, hw: 0.095, hh: 0.080, lift: 0.045,
    body: 'Two ponds, one long path, and the only ground on the tile nobody has tried to build on. The lake is fed by the same channel that runs the port.',
    stats: [['Area', '31 ha'], ['Water', '2 ponds'], ['Trees', '~1,900']],
  },
  {
    id: 'terraces',
    name: 'The Terraces',
    eyebrow: 'Residential',
    u: 0.395, v: 0.595, hw: 0.095, hh: 0.080, lift: 0.050,
    body: 'Low terracotta rows on a tight grid, walking distance from both the park and the rail. The oldest street pattern on the tile — the towers grew around it, not through it.',
    stats: [['Homes', '340'], ['Storeys', '2–3'], ['To rail', '4 min']],
  },
  {
    id: 'port',
    name: 'Port Quarter',
    eyebrow: 'Industry',
    u: 0.585, v: 0.585, hw: 0.080, hh: 0.065, lift: 0.055,
    body: 'Two gantry cranes, a container yard, and the deep-water berth that decides what the rest of the tile can afford. Runs a shift while downtown is dark.',
    stats: [['Cranes', '2'], ['Berths', '1 deep'], ['TEU / yr', '90,000']],
  },
  {
    id: 'marina',
    name: 'The Marina',
    eyebrow: 'Waterfront',
    u: 0.515, v: 0.700, hw: 0.085, hh: 0.055, lift: 0.040,
    body: 'Finger piers on the sheltered side of the channel, tucked under the elevated line. Same water as the port, four hundred metres and one tax bracket away.',
    stats: [['Berths', '46'], ['Piers', '5'], ['Draft', '3.2 m']],
  },
  {
    id: 'stadium',
    name: 'The Oval',
    eyebrow: 'Civic',
    u: 0.690, v: 0.470, hw: 0.070, hh: 0.060, lift: 0.060,
    body: 'An open track and a single covered stand, dropped on the east edge where land was cheap and the rail loop already went past. Empty six days a week.',
    stats: [['Capacity', '12,000'], ['Track', '400 m'], ['Built', '1998']],
  },
  {
    id: 'northyards',
    name: 'North Yards',
    eyebrow: 'Logistics',
    u: 0.505, v: 0.255, hw: 0.090, hh: 0.060, lift: 0.050,
    body: 'Sheds, hardstand and a lot of parked vehicles. The unglamorous half of the port’s job, moved inland so the waterfront could be looked at instead of used.',
    stats: [['Sheds', '6'], ['Hardstand', '4.2 ha'], ['Bays', '120']],
  },
];

/** Diamond containment test in media-image space. Returns distance: <1 is inside. */
export const diamondDist = (d, u, v) =>
  Math.abs(u - d.u) / d.hw + Math.abs(v - d.v) / d.hh;

/** Topmost district under a point, or null. Smallest plot wins so nested picks feel right. */
export function pick(u, v) {
  let best = null;
  let bestScore = Infinity;
  for (const d of DISTRICTS) {
    const dist = diamondDist(d, u, v);
    if (dist > 1) continue;
    const score = dist * (d.hw * d.hh);
    if (score < bestScore) { bestScore = score; best = d; }
  }
  return best;
}
