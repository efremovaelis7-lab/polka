// Анимация «загиба» страницы, как в бумажной книге.
// Всё сделано только трансформациями (без перерисовки текста), чтобы листание было плавным.
//
// Каждый лист (Sheet) живёт в обёртках: .sw (тень) > .sc (обрезка полуплоскостью) > .si (компенсация) > .sheet
// Геометрия: уголок страницы C тянется в точку F. Линия сгиба — серединный перпендикуляр к CF.

const DEG = 180 / Math.PI;

export function constrain(F, g) {
  const { x0, pw, H, cy } = g;
  // страница прикреплена к корешку: уголок не может уйти дальше ширины страницы от корешка
  let dx = F.x - x0, dy = F.y - cy;
  let d = Math.hypot(dx, dy);
  if (d > pw) { F = { x: x0 + dx * pw / d, y: cy + dy * pw / d }; }
  const oy = H - cy;
  const diag = Math.hypot(pw, H);
  dx = F.x - x0; dy = F.y - oy;
  d = Math.hypot(dx, dy);
  if (d > diag) { F = { x: x0 + dx * diag / d, y: oy + dy * diag / d }; }
  return F;
}

export class Curl {
  constructor(stage) {
    this.stage = stage;
    this.cast = document.createElement('div');
    this.cast.className = 'curl-cast';
    stage.appendChild(this.cast);
    this.active = null;
  }

  /**
   * @param o {upper, under, back, spread, W, H, cy, backIsPaper, paper}
   * upper/under/back — объекты Sheet (у них есть .sw .sc .si .shade)
   */
  begin(o) {
    this.end();
    const { W, H, spread } = o;
    const pw = spread ? W / 2 : W;
    const x0 = spread ? W / 2 : 0;
    this.g = { W, H, pw, x0, cy: o.cy, spread, D: 2 * Math.hypot(W, H) };
    this.o = o;
    const zs = [['under', 1], ['upper', 2], ['back', 4]];
    for (const [k, z] of zs) {
      const s = o[k];
      if (!s) continue;
      s.sw.style.zIndex = z;
      s.sw.style.visibility = 'visible';
      s.sw.style.opacity = '1';
    }
    this.cast.style.zIndex = 3;
    this.cast.style.display = 'block';
    o.back.sw.classList.add('as-back');
    o.upper.shade.style.display = 'block';
    o.back.shade.style.display = 'block';
    o.upper.shade.className = 'shade shade-front';
    o.back.shade.className = 'shade shade-back';
    if (o.backIsPaper) o.back.sw.classList.add('paper-back');
    this.active = true;
    this.C = { x: x0 + pw, y: o.cy };
    this.F1 = { x: x0 - pw, y: o.cy };
  }

  /** p — точка, куда утянули уголок (координаты сцены). */
  update(Fraw) {
    if (!this.active) return;
    const g = this.g, o = this.o;
    const C = this.C;
    let F = constrain(Fraw, g);
    if (F.x > C.x - 0.5) F = { x: C.x - 0.5, y: F.y };
    const vx = C.x - F.x, vy = C.y - F.y;
    const len = Math.hypot(vx, vy) || 0.001;
    const n = { x: vx / len, y: vy / len };               // нормаль к сгибу — в сторону уголка
    const M = { x: (C.x + F.x) / 2, y: (C.y + F.y) / 2 }; // точка на линии сгиба
    const phi = Math.atan2(n.y, n.x) * DEG;
    const D = g.D;
    const clipT = `translate(${M.x}px,${M.y}px) rotate(${phi}deg) translate(${-D}px,${-D / 2}px)`;
    const clipInv = `translate(${D}px,${D / 2}px) rotate(${-phi}deg) translate(${-M.x}px,${-M.y}px)`;

    // верхний лист: остаётся часть до сгиба
    setClip(o.upper, clipT, clipInv, D);

    // обратная сторона: отражение относительно сгиба (в развороте — ещё и относительно корешка)
    const d = { x: -n.y, y: n.x }; // направление линии сгиба
    const a = d.x * d.x - d.y * d.y, b = 2 * d.x * d.y, c2 = d.y * d.y - d.x * d.x;
    // R(X) = M + Mr (X - M)
    let m11 = a, m12 = b, m21 = b, m22 = c2;
    let tx = M.x - (m11 * M.x + m12 * M.y), ty = M.y - (m21 * M.x + m22 * M.y);
    let localM = M, localN = n;
    if (!o.backIsPaper) {
      // T = Rℓ ∘ Rs, Rs: x -> 2*x0 - x
      const sx = 2 * g.x0;
      const n11 = -m11, n21 = -m21; // Mr * diag(-1, 1)
      tx = m11 * sx + tx; ty = m21 * sx + ty;
      m11 = n11; m21 = n21;
      localM = { x: 2 * g.x0 - M.x, y: M.y };
      localN = { x: -n.x, y: n.y };
    }
    const T = `matrix(${m11},${m21},${m12},${m22},${tx},${ty})`;
    setClip(o.back, clipT, clipInv + ' ' + T, D);

    // тень, которую поднятый лист отбрасывает на следующую страницу
    const progress = Math.min(1, len / (2 * g.pw));
    const castW = Math.max(18, Math.min(90, len * 0.35));
    const cs = this.cast.style;
    cs.width = castW + 'px';
    cs.height = D + 'px';
    cs.transform = `translate(${M.x}px,${M.y}px) rotate(${phi}deg) translate(0px,${-D / 2}px)`;
    cs.opacity = String(0.55 * Math.sin(Math.PI * Math.min(1, progress * 1.15)) + 0.15);

    // блик/тень на обороте у сгиба (в локальных координатах листа-оборота)
    const lphi = Math.atan2(localN.y, localN.x) * DEG;
    const bw = Math.max(20, Math.min(160, len * 0.5));
    const bs = o.back.shade.style;
    bs.width = bw + 'px';
    bs.height = D + 'px';
    bs.transform = `translate(${localM.x}px,${localM.y}px) rotate(${lphi}deg) translate(0px,${-D / 2}px)`;

    // лёгкое затенение лицевой стороны у сгиба
    const fw = Math.max(16, Math.min(70, len * 0.25));
    const fs = o.upper.shade.style;
    fs.width = fw + 'px';
    fs.height = D + 'px';
    fs.transform = `translate(${M.x}px,${M.y}px) rotate(${phi}deg) translate(${-fw}px,${-D / 2}px)`;
    fs.opacity = String(Math.min(1, progress * 3));
    this.F = F;
    return F;
  }

  end() {
    if (!this.active) return;
    const o = this.o;
    for (const k of ['upper', 'under', 'back']) {
      const s = o[k];
      if (!s) continue;
      resetSheet(s);
    }
    o.back.sw.classList.remove('as-back', 'paper-back');
    this.cast.style.display = 'none';
    this.active = null;
  }
}

function setClip(s, clipT, inner, D) {
  const sc = s.sc.style, si = s.si.style;
  sc.width = D + 'px';
  sc.height = D + 'px';
  sc.transform = clipT;
  si.transform = inner;
}

export function resetSheet(s) {
  const sc = s.sc.style, si = s.si.style;
  sc.width = ''; sc.height = ''; sc.transform = '';
  si.transform = '';
  s.shade.style.display = 'none';
  s.sw.style.zIndex = '';
  s.sw.style.transform = '';
  s.sw.style.opacity = '';
}

// Траектория уголка при анимации по нажатию.
export function arcPoint(from, to, t, H, cy) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const lift = Math.sin(Math.PI * t) * H * 0.16 * (cy > H / 2 ? -1 : 1);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e + lift };
}
