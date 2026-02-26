export function populateAliasProductSelect(aliasProductSelect, products) {
	if (!aliasProductSelect) return;
	aliasProductSelect.innerHTML =
		'<option value="" selected disabled>Seleccione un producto</option>';
	(products || [])
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name, "es"))
		.forEach((product) => {
			const option = document.createElement("option");
			option.value = product.id;
			option.textContent = product.name;
			aliasProductSelect.appendChild(option);
		});
}

export function refreshAliasUnitAndVariantOptions({
	aliasProductSelect,
	aliasUnitSelect,
	aliasVariantSelect,
	productsById,
}) {
	if (!aliasProductSelect || !aliasUnitSelect || !aliasVariantSelect) return;

	const productId = aliasProductSelect.value;
	const product = productsById?.get?.(productId);

	aliasUnitSelect.innerHTML = '<option value="" selected>(sin override)</option>';
	aliasVariantSelect.innerHTML = '<option value="" selected>(sin override)</option>';

	if (!product) {
		aliasUnitSelect.disabled = true;
		aliasVariantSelect.disabled = true;
		return;
	}

	aliasUnitSelect.disabled = false;
	aliasVariantSelect.disabled = false;

	(product.units || []).forEach((unit) => {
		const option = document.createElement("option");
		option.value = unit;
		option.textContent = unit;
		aliasUnitSelect.appendChild(option);
	});
	(product.variants || []).forEach((variant) => {
		const option = document.createElement("option");
		option.value = variant;
		option.textContent = variant;
		aliasVariantSelect.appendChild(option);
	});
}
