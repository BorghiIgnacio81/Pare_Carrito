export const productIcon = (name) => {
  const lower = String(name || "").toLowerCase();
  // Más específicos primero.
  if (/\bverdeo\b|cebolla\s+de\s+verdeo|cibulet|ciboulette|cebollin|ceboll[ií]n/i.test(lower)) {
    return { kind: "image", src: "assets/icons/verdeo.svg", alt: "" };
  }
  if (/alcaucil/i.test(lower)) return "🌼";
  if (/brote\s+de\s+soja/i.test(lower)) return "🌱";
  if (/chaucha/i.test(lower)) return "🫛";
  if (/cayote/i.test(lower)) return "🥒";
  // Zapallito (coreanito) es redondo; zucchini es alargado.
  if (/zapallito|coreanito|zapallo\s+de\s+tronco/i.test(lower)) return "🟢";
  if (/zucchini|zukini/i.test(lower)) return "🥒";
  if (/ciruela/i.test(lower)) return "🍑";
  if (/damasco/i.test(lower)) return "🍑";
  // No hay emoji de espárrago: usamos uno verde y “largo” simbólico.
  if (/esp[aá]rragos|esparragos/i.test(lower)) return "🟩";
  if (/estevia/i.test(lower)) return "🍃";
  if (/hinojo/i.test(lower)) return "🌿";
  if (/nabos/i.test(lower)) return "🫜";
  if (/rabanito/i.test(lower)) return "🫜";
  if (/repollo\s+de\s+brucelas|coles\s+de\s+brucelas|brucelas/i.test(lower)) {
    return { kind: "dots", count: 3, tone: "green" };
  }
  if (/repollo/i.test(lower)) return "🥬";
  if (/quinotos/i.test(lower)) return "🍊";
  if (/yerba\s+buena/i.test(lower)) return "🍃";
  if (/miel/i.test(lower)) return "🍯";
  if (/jengibre/i.test(lower)) return "🫚";
  if (/palta/i.test(lower)) return "🥑";
  if (/berenjena/i.test(lower)) return "🍆";
  if (/pepino/i.test(lower)) return "🥒";
  if (/ajo/i.test(lower)) return "🧄";
  if (/calabaza|zapallo/i.test(lower)) return "🎃";
  if (/br[oó]coli|brocoli|coliflor/i.test(lower)) return "🥦";
  if (/champi(?:ñ|gn)ones|girgolas|seta|hongo|hongos\s+de\s+pino/i.test(lower)) return "🍄";
  if (/almendra|almendras|mani|man[ií]/i.test(lower)) return "🥜";
  if (/nuez\b|nueces/i.test(lower)) return { kind: "walnut" };
  if (/garbanzo|lenteja|poroto|porotos|habas/i.test(lower)) return "🫘";
  if (/arveja/i.test(lower)) return "🫛";
  if (/quinoa|chia/i.test(lower)) return "🌾";
  if (/canela|comino|or[eé]gano|oregano|piment[oó]n/i.test(lower)) return "🧂";

  if (/(banana|bananas|pl[aá]tano)/i.test(lower)) return "🍌";
  if (/manzana/i.test(lower)) return "🍎";
  if (/pera/i.test(lower)) return "🍐";
  if (/uva/i.test(lower)) return "🍇";
  if (/anan[aá]/i.test(lower)) return "🍍";
  if (/lim[oó]n|lima/i.test(lower)) return "🍋";
  if (/naranja|mandarina|pomelo|tangerina|tanjarina/i.test(lower)) return "🍊";
  if (/frutilla|ar[aá]ndanos|frutos rojos/i.test(lower)) return "🍓";
  if (/ar[aá]ndanos/i.test(lower)) return "🫐";
  if (/cereza/i.test(lower)) return "🍒";
  if (/sand[ií]a/i.test(lower)) return "🍉";
  if (/mel[oó]n/i.test(lower)) return "🍈";
  if (/kiwi/i.test(lower)) return "🥝";
  if (/durazno|pelones/i.test(lower)) return "🍑";
  if (/mango|papaya|granada|maracuya/i.test(lower)) return "🥭";
  if (/tomate/i.test(lower)) return "🍅";
  if (/lechuga|rucula|r[uú]cula|espinaca|berro|acelga|apio|verdeo|radicheta/i.test(lower)) return "🥬";
  if (/zanahoria/i.test(lower)) return "🥕";
  if (/remolacha/i.test(lower)) return "🫜";
  if (/papa|papines/i.test(lower)) return "🥔";
  if (/batata/i.test(lower)) return "🍠";
  if (/choclo|maiz/i.test(lower)) return "🌽";
  if (/locoto|aji|aj[ií]/i.test(lower)) return "🌶️";
  if (/pimiento|morr[oó]n/i.test(lower)) return "🫑";
  if (/cebolla|puerro/i.test(lower)) return "🧅";
  if (/huevo/i.test(lower)) return "🥚";
  if (/queso|quesillo/i.test(lower)) return "🧀";
  if (/hierba|menta|perejil|albahaca|romero|laurel|salvia|tomillo|cilantro|provenzal/i.test(lower)) return "🌿";
  return "🧺";
};

export const renderProductIcon = (iconSpec, container) => {
  if (!container) {
    return;
  }
  container.textContent = "";

  if (typeof iconSpec === "string") {
    container.textContent = iconSpec;
    return;
  }

  const spec = iconSpec && typeof iconSpec === "object" ? iconSpec : null;
  if (!spec) {
    container.textContent = "🧺";
    return;
  }

  if (spec.kind === "dots") {
    const wrap = document.createElement("span");
    wrap.className = `icon-dots${spec.tone ? ` icon-dots--${spec.tone}` : ""}`;
    const count = Number.isFinite(spec.count) && spec.count > 0 ? Math.min(5, Math.floor(spec.count)) : 3;
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement("span");
      dot.className = "icon-dots__dot";
      wrap.appendChild(dot);
    }
    container.appendChild(wrap);
    return;
  }

  if (spec.kind === "image") {
    const img = document.createElement("img");
    img.className = "product-icon__img";
    img.alt = typeof spec.alt === "string" ? spec.alt : "";
    img.decoding = "async";
    img.loading = "lazy";
    img.src = spec.src;
    img.addEventListener("error", () => {
      container.textContent = "🥬";
    });
    container.appendChild(img);
    return;
  }

  if (spec.kind === "emojiTint") {
    const emoji = typeof spec.emoji === "string" ? spec.emoji : "";
    const tone = String(spec.tone || "").toLowerCase();
    const span = document.createElement("span");
    span.className = "product-icon__emoji";
    span.textContent = emoji || "🧺";
    // Best-effort: emojis are not truly recolorable, but CSS filters usually
    // affect color glyph rendering enough for a red/yellow tint.
    if (tone === "red") {
      span.style.filter = "hue-rotate(-115deg) saturate(1.6) brightness(0.95)";
    } else if (tone === "yellow") {
      span.style.filter = "hue-rotate(-35deg) saturate(1.7) brightness(1.05)";
    } else {
      span.style.filter = "";
    }
    container.appendChild(span);
    return;
  }

  if (spec.kind === "pepper") {
    const tone = String(spec.tone || "").toLowerCase();
    const color =
      tone === "red"
        ? "#d62828"
        : tone === "green"
          ? "#2f9e44"
          : tone === "yellow"
            ? "#f2b600"
            : "currentColor";

    const shadowColor =
      tone === "red"
        ? "rgba(126, 18, 18, 0.35)"
        : tone === "green"
          ? "rgba(17, 92, 38, 0.35)"
          : tone === "yellow"
            ? "rgba(140, 98, 0, 0.35)"
            : "rgba(0,0,0,0.25)";

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("width", "1.25em");
    svg.setAttribute("height", "1.25em");
    svg.setAttribute("aria-hidden", "true");
    svg.classList.add("product-icon__svg");

    // stem
    const stem = document.createElementNS(svgNS, "path");
    stem.setAttribute(
      "d",
      "M33 6c-3 0-6 2-7 5-1 3 0 6 2 8 1 1 2 2 2 4v2c0 1 1 2 2 2h2c1 0 2-1 2-2v-2c0-2 1-3 2-4 2-2 3-5 2-8-1-3-4-5-7-5z"
    );
    stem.setAttribute("fill", "#2f6f3b");
    svg.appendChild(stem);

    const stemHighlight = document.createElementNS(svgNS, "path");
    stemHighlight.setAttribute("d", "M30 12c1-2 3-3 5-3 1 0 2 0 3 1");
    stemHighlight.setAttribute("fill", "none");
    stemHighlight.setAttribute("stroke", "rgba(255,255,255,0.35)");
    stemHighlight.setAttribute("stroke-width", "2");
    stemHighlight.setAttribute("stroke-linecap", "round");
    svg.appendChild(stemHighlight);

    // pepper body (bell-pepper-ish shape with lobes)
    const body = document.createElementNS(svgNS, "path");
    body.setAttribute(
      "d",
      "M22 22c-3 4-5 9-5 15 0 12 6 20 15 20s15-8 15-20c0-6-2-11-5-15-1-2-3-3-5-3-2 0-3 1-4 2-1 1-2 1-3 0-1-1-2-2-4-2-2 0-4 1-5 3z"
    );
    body.setAttribute("fill", color);
    body.setAttribute("stroke", "rgba(0,0,0,0.35)");
    body.setAttribute("stroke-width", "1.4");
    svg.appendChild(body);

    // lobes / shading
    const lobe = document.createElementNS(svgNS, "path");
    lobe.setAttribute(
      "d",
      "M20 33c2-2 4-3 6-3 3 0 4 2 5 4 1 3 1 6 0 9-1 6-4 10-8 11-4-2-6-6-6-12 0-4 1-7 3-9z"
    );
    lobe.setAttribute("fill", shadowColor);
    lobe.setAttribute("opacity", "0.75");
    svg.appendChild(lobe);

    const lobe2 = document.createElementNS(svgNS, "path");
    lobe2.setAttribute(
      "d",
      "M44 33c-2-2-4-3-6-3-3 0-4 2-5 4-1 3-1 6 0 9 1 6 4 10 8 11 4-2 6-6 6-12 0-4-1-7-3-9z"
    );
    lobe2.setAttribute("fill", "rgba(255,255,255,0.12)");
    lobe2.setAttribute("opacity", "0.65");
    svg.appendChild(lobe2);

    // highlight
    const hi = document.createElementNS(svgNS, "path");
    hi.setAttribute("d", "M28 28c-3 3-5 7-5 13 0 7 3 12 8 14");
    hi.setAttribute("fill", "none");
    hi.setAttribute("stroke", "rgba(255,255,255,0.5)");
    hi.setAttribute("stroke-width", "3");
    hi.setAttribute("stroke-linecap", "round");
    svg.appendChild(hi);

    container.appendChild(svg);
    return;
  }

  if (spec.kind === "walnut") {
    const wrap = document.createElement("span");
    wrap.className = "icon-walnut";

    const left = document.createElement("span");
    left.className = "icon-walnut__half icon-walnut__half--left";

    const right = document.createElement("span");
    right.className = "icon-walnut__half icon-walnut__half--right";

    const seam = document.createElement("span");
    seam.className = "icon-walnut__seam";

    wrap.appendChild(left);
    wrap.appendChild(right);
    wrap.appendChild(seam);
    container.appendChild(wrap);
    return;
  }

  container.textContent = "🧺";
};
