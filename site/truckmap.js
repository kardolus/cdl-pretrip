// Tap-the-Truck walk-around map. Maps each tappable SVG zone (id "zone-<id>" in
// img/diagrams/truck-map.svg) to a content section. app.js (renderTruckMap) inlines the
// SVG, colors each zone by that section's mastery %, and opens a focused area drill on tap.
window.PRETRIP_TRUCKMAP = {
  svg: "img/diagrams/truck-map.svg",
  zones: [
    { id: "in-cab",    section: "in-cab" },
    { id: "air-brake", section: "air-brake" },
    { id: "coupling",  section: "coupling" },
    { id: "part-a",    section: "part-a" },
    { id: "part-b",    section: "part-b" },
    { id: "part-c",    section: "part-c" },
  ],
};
