export function createLayoutController({ itemsContainer, summaryBox }) {
	let coverageScheduled = false;
	const updateCoveredCards = () => {
		coverageScheduled = false;
		if (!summaryBox || !itemsContainer) {
			return;
		}

		// En pantallas angostas (1 sola columna), el resumen fijo intersecta con casi
		// todas las cards y puede dejar el catálogo "invisible". En ese caso, no
		// aplicamos el modo "covered".
		const styles = window.getComputedStyle(itemsContainer);
		const gridColsRaw = String(styles.getPropertyValue("grid-template-columns") || "");
		const gridColCount = gridColsRaw.split(" ").filter(Boolean).length;
		const allowCoverage = gridColCount > 1;

		const isFiltering = itemsContainer.dataset && itemsContainer.dataset.filtering === "1";
		const summaryRect = summaryBox.getBoundingClientRect();
		const cards = itemsContainer.querySelectorAll(".product-card");
		cards.forEach((card) => {
			if (card.style.display === "none") {
				card.classList.remove("covered");
				return;
			}
			if (isFiltering) {
				card.classList.remove("covered");
				return;
			}
			if (!allowCoverage) {
				card.classList.remove("covered");
				return;
			}
			const rect = card.getBoundingClientRect();
			const intersects = !(
				rect.right < summaryRect.left ||
				rect.left > summaryRect.right ||
				rect.bottom < summaryRect.top ||
				rect.top > summaryRect.bottom
			);
			card.classList.toggle("covered", intersects);
		});
	};

	const scheduleCoverageUpdate = () => {
		if (coverageScheduled) return;
		coverageScheduled = true;
		requestAnimationFrame(updateCoveredCards);
	};

	let masonryScheduled = false;
	const resizeMasonryGrid = () => {
		if (!itemsContainer) {
			return;
		}
		const styles = window.getComputedStyle(itemsContainer);
		const rowHeight = Number.parseInt(styles.getPropertyValue("grid-auto-rows"), 10) || 10;
		const rowGap =
			Number.parseInt(styles.getPropertyValue("row-gap"), 10) ||
			Number.parseInt(styles.getPropertyValue("grid-row-gap"), 10) ||
			16;
		itemsContainer.querySelectorAll(".product-card").forEach((card) => {
			if (card.style.display === "none") {
				card.style.gridRowEnd = "";
				return;
			}
			const height = card.getBoundingClientRect().height;
			const span = Math.ceil((height + rowGap) / (rowHeight + rowGap));
			card.style.gridRowEnd = `span ${span}`;
		});
	};

	const scheduleMasonryUpdate = () => {
		if (masonryScheduled) return;
		masonryScheduled = true;
		requestAnimationFrame(() => {
			masonryScheduled = false;
			resizeMasonryGrid();
		});
	};

	return {
		updateCoveredCards,
		scheduleCoverageUpdate,
		resizeMasonryGrid,
		scheduleMasonryUpdate,
	};
}
