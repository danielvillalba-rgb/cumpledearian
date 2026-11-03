// Dibuja una Esfera del Dragón (SVG) con N estrellas.
(function () {
  let uid = 0;

  function estrella(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.42;
      pts.push((cx + rr * Math.cos(ang)).toFixed(2) + "," + (cy + rr * Math.sin(ang)).toFixed(2));
    }
    return `<polygon points="${pts.join(" ")}" fill="#d81e05" stroke="#8f1100" stroke-width="0.8" stroke-linejoin="round"/>`;
  }

  function posiciones(n) {
    const c = 50;
    if (n === 1) return [[c, c, 15]];
    const r = 11.5;
    const ring = (k, rad, rot) =>
      Array.from({ length: k }, (_, i) => {
        const a = rot + (i * 2 * Math.PI) / k;
        return [c + rad * Math.cos(a), c + rad * Math.sin(a), r];
      });
    if (n === 2) return ring(2, 13, -Math.PI / 4);
    if (n === 3) return ring(3, 15, -Math.PI / 2);
    if (n === 4) return ring(4, 16, -Math.PI / 4);
    if (n === 5) return ring(5, 18, -Math.PI / 2).map((p) => [p[0], p[1], 10.5]);
    if (n === 6) return [[c, c, 9.5], ...ring(5, 20, -Math.PI / 2).map((p) => [p[0], p[1], 9.5])];
    return [[c, c, 9], ...ring(6, 21, -Math.PI / 2).map((p) => [p[0], p[1], 9])];
  }

  window.esferaSVG = function (n, apagada) {
    const id = "g" + n + "_" + uid++;
    const colores = apagada
      ? ["#6b7280", "#3f4652", "#1f242c"]
      : ["#fff3b0", "#ffb31a", "#d96a00"];
    const estrellas = posiciones(n).map(([x, y, r]) => estrella(x, y, r)).join("");
    return `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esfera de ${n} estrella${n > 1 ? "s" : ""}">
  <defs>
    <radialGradient id="${id}" cx="38%" cy="32%" r="72%">
      <stop offset="0%" stop-color="${colores[0]}"/>
      <stop offset="45%" stop-color="${colores[1]}"/>
      <stop offset="100%" stop-color="${colores[2]}"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#${id})" stroke="${apagada ? "#2b3038" : "#a34e00"}" stroke-width="1.2"/>
  <g opacity="${apagada ? 0.35 : 1}">${estrellas}</g>
  <ellipse cx="34" cy="26" rx="15" ry="9" fill="#fff" opacity="${apagada ? 0.12 : 0.55}" transform="rotate(-30 34 26)"/>
  <ellipse cx="66" cy="78" rx="10" ry="4" fill="#fff" opacity="${apagada ? 0.05 : 0.18}" transform="rotate(-30 66 78)"/>
</svg>`;
  };
})();
