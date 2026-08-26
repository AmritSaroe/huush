import DOMPurify from "dompurify";

import { imageIdentity } from "./extractor/metadata.js";

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: false,
  ADD_TAGS: ["figure", "figcaption", "picture", "source"],
  ADD_ATTR: ["src", "alt", "title", "width", "height", "loading", "decoding", "srcset", "sizes"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "svg", "canvas", "meta", "link", "base", "noscript"],
  FORBID_ATTR: ["style", "class", "id", "srcdoc"],
};

const PROMOTIONAL_CLASS_RE = /(?:newsletter|subscribe|subscription|promo|promotion|advert|advertisement|sponsor|recommended|related|social[-_]?share|share[-_]?tools|follow[-_]?us)/i;
const PROMOTIONAL_TEXT_RE = /\b(?:subscribe|sign\s*up|join\s+(?:our|the)|get\s+(?:our|the)|stay\s+(?:updated|up\s+to\s+date)|follow\s+us)\b/i;
const UTILITY_IMAGE_RE = /(?:favicon|apple[-_]?touch[-_]?icon|touch[-_]?icon|site[-_]?icon|avatar|profile[-_]?photo|profile[-_]?image|emoji)/i;

function removeUnsafeNodes(root) {
  root.querySelectorAll("script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, canvas, meta, link, base, noscript").forEach((node) => node.remove());
}

function removePromotionalNodes(root) {
  root.querySelectorAll("aside, footer, [class], [id]").forEach((node) => {
    const hint = `${node.tagName} ${node.getAttribute("class") || ""} ${node.id || ""}`;
    if (PROMOTIONAL_CLASS_RE.test(hint)) node.remove();
  });

  [...root.querySelectorAll("p, div, section, aside, footer")].forEach((node) => {
    if (!node.parentNode) return;
    const text = (node.textContent || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 320 || !PROMOTIONAL_TEXT_RE.test(text)) return;
    const ancestor = node.closest("div, section, aside, footer");
    const container = ancestor && ancestor !== root ? ancestor : node;
    if ((container.textContent || "").trim().length <= 380) container.remove();
  });
}

function resolveImageCandidate(image, baseUrl) {
  const candidates = [
    image.getAttribute("data-src"),
    image.getAttribute("data-original"),
    image.getAttribute("data-lazy-src"),
    image.getAttribute("src"),
  ];
  const candidate = candidates.find(Boolean);
  if (!candidate) return "";
  try {
    const resolved = new URL(candidate, baseUrl || document.baseURI);
    if (!/^https?:$/i.test(resolved.protocol)) return "";
    return resolved.href;
  } catch {
    return "";
  }
}

function isUtilityImage(image, resolvedUrl) {
  const hint = `${resolvedUrl} ${image.getAttribute("alt") || ""} ${image.getAttribute("title") || ""}`;
  if (UTILITY_IMAGE_RE.test(hint)) return true;
  const width = Number(image.getAttribute("width"));
  const height = Number(image.getAttribute("height"));
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && width <= 64 && height <= 64;
}

/** Sanitize stored article HTML while preserving usable image URLs. */
export function sanitizeContent(html = "", baseUrl = "", heroFallback = "") {
  if (baseUrl && typeof baseUrl === "object") {
    heroFallback = baseUrl.heroFallback || "";
    baseUrl = baseUrl.baseUrl || "";
  }

  const container = document.createElement("div");
  container.innerHTML = String(html || "");
  removeUnsafeNodes(container);
  removePromotionalNodes(container);

  const seenImageIdentities = new Set();
  container.querySelectorAll("img").forEach((image) => {
    const src = resolveImageCandidate(image, baseUrl);
    if (!src || isUtilityImage(image, src)) {
      image.remove();
      return;
    }
    const identity = imageIdentity(src, baseUrl);
    if (seenImageIdentities.has(identity)) {
      const figure = image.closest("figure");
      if (figure && figure.querySelectorAll("img").length === 1) figure.remove();
      else image.remove();
      return;
    }
    seenImageIdentities.add(identity);
    image.setAttribute("src", src);
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
    ["srcset", "data-src", "data-original", "data-lazy-src", "data-srcset", "sizes"].forEach((attribute) => image.removeAttribute(attribute));
  });

  container.querySelectorAll("picture").forEach((picture) => {
    if (picture.querySelector("img")) return;
    const figure = picture.closest("figure");
    if (figure && !figure.querySelector("img")) figure.remove();
    else picture.remove();
  });
  container.querySelectorAll("figure").forEach((figure) => {
    if (!figure.querySelector("img") && !figure.textContent.trim()) figure.remove();
  });

  container.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === "style" || name === "class" || name === "id" || name.startsWith("data-") || name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
    });
  });

  container.querySelectorAll("div, span, p").forEach((element) => {
    if (!element.textContent.trim() && !element.querySelector("img")) element.remove();
  });

  if (!container.firstElementChild && heroFallback) container.insertAdjacentHTML("afterbegin", heroFallback);
  const cleanHtml = DOMPurify.sanitize(container.innerHTML, PURIFY_CONFIG);
  const cleanContainer = document.createElement("div");
  cleanContainer.innerHTML = cleanHtml;
  removeUnsafeNodes(cleanContainer);
  cleanContainer.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === "style" || name === "class" || name === "id" || name.startsWith("data-") || name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return cleanContainer.innerHTML;
}
