import { categoryMeta, findMatchingTools, getTool } from "../tools/registry";
import type { ToolCategory } from "../tools/types";

const isCategory = (value: string | undefined): value is ToolCategory => Boolean(value && value in categoryMeta);

export const initToolCatalog = () => {
  document.querySelectorAll<HTMLElement>("[data-tool-catalog]").forEach((catalog) => {
    if (catalog.dataset.initialized === "true") return;
    catalog.dataset.initialized = "true";

    const grid = catalog.querySelector<HTMLElement>("[data-catalog-grid]");
    const searchForm = catalog.querySelector<HTMLFormElement>("[data-catalog-search]");
    const searchInput = catalog.querySelector<HTMLInputElement>("[data-tool-search-input]");
    const count = catalog.querySelector<HTMLElement>("[data-catalog-count]");
    const title = catalog.querySelector<HTMLElement>("[data-catalog-title]");
    const eyebrow = catalog.querySelector<HTMLElement>("[data-catalog-eyebrow]");
    const description = catalog.querySelector<HTMLElement>("[data-catalog-description]");
    const filters = catalog.querySelector<HTMLElement>("[data-category-filters]");
    const groups = [...catalog.querySelectorAll<HTMLElement>("[data-catalog-group]")];
    if (!grid || !searchForm || !searchInput || !count || !title || !eyebrow || !description) return;

    let selectedCategory = catalog.dataset.initialCategory ?? "all";
    const items = [...grid.querySelectorAll<HTMLElement>("[data-catalog-item]")];
    const empty = document.createElement("div");
    empty.className = "empty-catalog";
    empty.hidden = true;
    const emptyTitle = document.createElement("strong");
    emptyTitle.textContent = "No tools match that search.";
    const emptyDetail = document.createElement("p");
    emptyDetail.textContent = "Try a task or format like PNG to PDF.";
    empty.append(emptyTitle, emptyDetail);
    grid.append(empty);

    const render = () => {
      const query = searchInput.value.trim();
      const matches = new Set(findMatchingTools(query).map((tool) => tool.slug));
      let visibleCount = 0;

      items.forEach((item) => {
        const tool = getTool(item.dataset.toolSlug ?? "");
        const categoryMatches = selectedCategory === "all" || item.dataset.toolCategory === selectedCategory;
        const searchMatches = !query || matches.has(tool?.slug ?? "");
        const visible = categoryMatches && searchMatches;
        item.hidden = !visible;
        if (visible) visibleCount += 1;
      });

      groups.forEach((group) => {
        group.hidden = ![...group.querySelectorAll<HTMLElement>("[data-catalog-item]")].some((item) => !item.hidden);
      });
      empty.hidden = visibleCount > 0;
      count.textContent = `${visibleCount} ${visibleCount === 1 ? "tool" : "tools"}`;
      filters?.querySelectorAll<HTMLButtonElement>("[data-category]").forEach((button) => {
        button.classList.toggle("is-active", button.dataset.category === selectedCategory);
      });

      if (isCategory(selectedCategory)) {
        title.textContent = `${categoryMeta[selectedCategory].label} tools.`;
        eyebrow.textContent = categoryMeta[selectedCategory].label;
        description.textContent = categoryMeta[selectedCategory].description;
      } else {
        title.textContent = "All the useful file tools.";
        eyebrow.textContent = "Tool library";
        description.textContent = "Pick a production-ready tool and move from select to download in a few clear steps; any temporary server processing is disclosed clearly.";
      }
    };

    searchInput.addEventListener("input", render);
    searchForm.addEventListener("submit", (event) => event.preventDefault());
    filters?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLButtonElement>("[data-category]");
      if (!button?.dataset.category) return;
      selectedCategory = button.dataset.category;
      render();
    });
    render();
  });
};
