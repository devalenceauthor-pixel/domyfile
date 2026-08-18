import { findMatchingTools, getTool, getToolAvailability, getToolPath, categoryMeta } from "../tools/registry";
import type { ToolDefinition } from "../tools/types";

const hideSearchResults = () => {
  document.querySelectorAll<HTMLElement>("[data-tool-search-results]").forEach((results) => {
    results.hidden = true;
  });
};

const createSearchResult = (tool: ToolDefinition) => {
  const button = document.createElement("button");
  button.className = "search-result-item";
  button.type = "button";
  button.setAttribute("role", "option");
  button.dataset.searchSlug = tool.slug;

  const icon = document.createElement("span");
  icon.className = "search-result-icon";
  const iconImage = document.createElement("img");
  iconImage.className = "tool-icon-svg";
  iconImage.src = `/assets/icons/${tool.slug}.svg`;
  iconImage.alt = "";
  iconImage.width = 40;
  iconImage.height = 40;
  iconImage.setAttribute("aria-hidden", "true");
  icon.append(iconImage);

  const copy = document.createElement("span");
  copy.className = "search-result-copy";
  const title = document.createElement("strong");
  title.textContent = tool.title;
  const meta = document.createElement("span");
  meta.textContent = `${categoryMeta[tool.category].label} · ${getToolAvailability(tool) === "production-ready" ? tool.input.formats.slice(0, 3).join(" · ") : "Deferred for V1"}`;
  copy.append(title, meta);

  button.append(icon, copy);
  return button;
};

const renderSearchResults = (input: HTMLInputElement, results: HTMLElement) => {
  const query = input.value.trim();
  results.replaceChildren();

  if (!query) {
    results.hidden = true;
    return;
  }

  const matches = findMatchingTools(query).slice(0, 6);
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "empty-catalog";
    const title = document.createElement("strong");
    title.textContent = "No matching tool.";
    const detail = document.createElement("p");
    detail.textContent = "Try a task or format like PNG to PDF.";
    empty.append(title, detail);
    results.append(empty);
  } else {
    matches.forEach((tool) => results.append(createSearchResult(tool)));
  }
  results.hidden = false;
};

const navigateToFirstMatch = (input: HTMLInputElement, results: HTMLElement) => {
  const firstMatch = findMatchingTools(input.value.trim())[0];
  if (!firstMatch) return;
  results.hidden = true;
  window.location.href = getToolPath(firstMatch);
};

const initSearch = () => {
  document.querySelectorAll<HTMLFormElement>("form[data-tool-search]").forEach((form) => {
    if (form.dataset.initialized === "true") return;
    form.dataset.initialized = "true";
    const input = form.querySelector<HTMLInputElement>("[data-tool-search-input]");
    const results = form.parentElement?.querySelector<HTMLElement>("[data-tool-search-results]");
    if (!input || !results) return;

    input.addEventListener("input", () => renderSearchResults(input, results));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      navigateToFirstMatch(input, results);
    });
    results.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>("[data-search-slug]");
      if (!button?.dataset.searchSlug) return;
      const tool = getTool(button.dataset.searchSlug);
      if (!tool) return;
      window.location.href = getToolPath(tool);
    });
  });
};

export const initSiteHeader = () => {
  if (document.documentElement.dataset.domyfileHeaderInitialized === "true") return;
  document.documentElement.dataset.domyfileHeaderInitialized = "true";

  initSearch();

  const menuToggle = document.querySelector<HTMLButtonElement>("[data-menu-toggle]");
  const mobileNav = document.querySelector<HTMLElement>("[data-mobile-nav]");
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      menuToggle.setAttribute("aria-label", expanded ? "Open navigation" : "Close navigation");
      mobileNav.hidden = expanded;
    });

    mobileNav.addEventListener("click", () => {
      mobileNav.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation");
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    if (!(target instanceof Element) || !target.closest("[data-tool-search-wrap]")) hideSearchResults();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName ?? "")) {
      event.preventDefault();
      document.querySelector<HTMLInputElement>("[data-tool-search-input]")?.focus();
    }
    if (event.key === "Escape") hideSearchResults();
  });
};
