import {
  loadClientAliases,
  saveClientAliases,
  getAliasStorageKeyFromSource,
} from "../aliases/aliasStore.js";

export const createImportBoxController = ({
  clientSelect,
  pasteOrderToggle,
  whatsappImportBox,
  pasteOrderText,
  pasteOrderApply,
  pasteOrderClear,
  pasteOrderReport,
  aliasSourceInput,
  aliasProductSelect,
  aliasUnitSelect,
  aliasVariantSelect,
  aliasUnitModeCheckbox,
  aliasCommentEnabledCheckbox,
  aliasCommentField,
  aliasCommentInput,
  aliasSaveButton,
  refreshAliasUnitAndVariantOptions,
  summaryController,
  parseWhatsAppTextToItems,
  resolveParsedLineToItem,
  normalizeVariantForSheetMatch,
  parseQuantityUnitAndName,
  ensureCardRowAndSetQuantity,
  onBeforeParse,
}) => {
  const updateImportUiState = () => {
    const hasClient = Boolean(clientSelect?.value) || Number(clientSelect?.selectedIndex) > 0;
    if (pasteOrderToggle) {
      pasteOrderToggle.classList.toggle("hidden", !hasClient);
      pasteOrderToggle.disabled = !hasClient;
    }
    if (whatsappImportBox) {
      // se muestra por toggle
      if (!hasClient) {
        whatsappImportBox.classList.add("hidden");
      }
    }
    const hasText = Boolean(pasteOrderText?.value?.trim());
    if (pasteOrderApply) {
      pasteOrderApply.disabled = !hasClient || !hasText;
    }
    if (pasteOrderClear) {
      pasteOrderClear.disabled = !hasClient || (!hasText && !(pasteOrderReport?.textContent || "").trim());
    }

    const aliasReady =
      Boolean(clientSelect?.value) &&
      Boolean(aliasSourceInput?.value?.trim()) &&
      Boolean(aliasProductSelect?.value);
    if (aliasSaveButton) {
      aliasSaveButton.disabled = !aliasReady;
    }
  };

  const syncAliasCommentUi = () => {
    const enabled = Boolean(aliasCommentEnabledCheckbox?.checked);
    if (aliasCommentField) {
      aliasCommentField.classList.toggle("hidden", !enabled);
    }
    if (aliasCommentInput) {
      aliasCommentInput.disabled = !enabled;
      if (!enabled) {
        aliasCommentInput.value = "";
      }
    }
  };

  const processPasteText = () => {
    const clientId = clientSelect?.value || "";
    const text = pasteOrderText?.value || "";
    if (!clientId || !text.trim()) {
      updateImportUiState();
      return;
    }

    try {
      if (typeof onBeforeParse === "function") {
        onBeforeParse({ clientId, text });
      }

      const result = parseWhatsAppTextToItems(
        text,
        clientId,
        resolveParsedLineToItem,
        normalizeVariantForSheetMatch
      );
      summaryController?.setRequestedCount?.(Array.isArray(result.resolved) ? result.resolved.length : 0);
      summaryController?.setWarnings?.(result.warnings);
      renderPasteReport(result);

      // aplicar a UI
      const failed = [];
      (Array.isArray(result.resolved) ? result.resolved : []).forEach((item) => {
        const status = ensureCardRowAndSetQuantity(item);
        if (!status.ok) {
          failed.push({ item, reason: status.reason });
        }
      });

      if (failed.length && pasteOrderReport) {
        const note = document.createElement("p");
        note.textContent = `Algunos items no se pudieron aplicar a la grilla (${failed.length}).`;
        pasteOrderReport.appendChild(note);

        const list = document.createElement("ul");
        failed.slice(0, 12).forEach(({ item, reason }) => {
          const li = document.createElement("li");
          const raw = String(item?.source || item?.raw || "").trim();
          const pid = String(item?.productId || "").trim();
          const unit = String(item?.unit || "").trim();
          const variant = String(item?.variant || "").trim();
          const comment = String(item?.comment || "").trim();
          const qty = item?.unitMode
            ? String(item?.quantityText || "").trim()
            : String(item?.quantity ?? "").trim();
          const resolvedBits = [pid, variant, unit].filter(Boolean).join(" · ");
          const extra = [
            resolvedBits,
            qty ? `qty=${qty}` : "",
            comment ? `cmt=${comment}` : "",
            reason ? `(${reason})` : "",
          ]
            .filter(Boolean)
            .join(" ");
          li.textContent = extra ? `${raw || pid || "(sin texto)"} — ${extra}` : raw || pid || "(sin texto)";
          list.appendChild(li);
        });
        pasteOrderReport.appendChild(list);

        if (failed.length > 12) {
          const more = document.createElement("p");
          more.textContent = `(${failed.length - 12} más)`;
          pasteOrderReport.appendChild(more);
        }
      }
    } catch (error) {
      const message = String(error?.message || error || "").trim() || "Error procesando el pedido.";
      console.error(error);
      if (pasteOrderReport) {
        pasteOrderReport.innerHTML = "";
        const p = document.createElement("p");
        p.textContent = message;
        pasteOrderReport.appendChild(p);
      } else {
        alert(message);
      }
    } finally {
      updateImportUiState();
    }
  };

  const renderPasteReport = ({ resolved = [], unresolved = [], ignored = [] } = {}) => {
    if (!pasteOrderReport) {
      return;
    }
    const wrap = document.createElement("div");

    const summary = document.createElement("p");
    summary.textContent = `Cargados: ${resolved.length} · No reconocidos: ${unresolved.length}`;
    wrap.appendChild(summary);

    if (unresolved.length) {
      const title = document.createElement("p");
      title.textContent = "No reconocidos (clic para crear alias):";
      wrap.appendChild(title);
      const list = document.createElement("ul");
      unresolved.forEach((entry) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry.raw;
        button.addEventListener("click", () => {
          if (aliasSourceInput) {
            aliasSourceInput.value = entry.raw;
            aliasSourceInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          updateImportUiState();
        });
        li.appendChild(button);
        list.appendChild(li);
      });
      wrap.appendChild(list);
    }

    if (!resolved.length && !unresolved.length && ignored.length) {
      const note = document.createElement("p");
      note.textContent = "No se encontraron líneas con cantidad.";
      wrap.appendChild(note);
    }

    pasteOrderReport.innerHTML = "";
    pasteOrderReport.appendChild(wrap);
  };

  const reset = () => {
    if (pasteOrderText) {
      pasteOrderText.value = "";
    }
    if (pasteOrderReport) {
      pasteOrderReport.innerHTML = "<p>Sin procesar.</p>";
    }
    summaryController?.resetRequestedCount?.();
    summaryController?.resetWarnings?.();

    if (aliasSourceInput) {
      aliasSourceInput.value = "";
    }
    if (aliasProductSelect) {
      aliasProductSelect.value = "";
    }

    if (aliasUnitModeCheckbox) {
      aliasUnitModeCheckbox.checked = false;
    }

    if (aliasCommentEnabledCheckbox) {
      aliasCommentEnabledCheckbox.checked = false;
    }
    syncAliasCommentUi();

    if (typeof refreshAliasUnitAndVariantOptions === "function") {
      refreshAliasUnitAndVariantOptions();
    }
    updateImportUiState();
  };

  const init = () => {
    clientSelect?.addEventListener("change", updateImportUiState);
    aliasProductSelect?.addEventListener("change", () => {
      refreshAliasUnitAndVariantOptions?.();
      updateImportUiState();
    });
    aliasSourceInput?.addEventListener("input", updateImportUiState);
    aliasUnitSelect?.addEventListener("change", updateImportUiState);
    aliasVariantSelect?.addEventListener("change", updateImportUiState);
    aliasUnitModeCheckbox?.addEventListener("change", updateImportUiState);
    aliasCommentEnabledCheckbox?.addEventListener("change", () => {
      syncAliasCommentUi();
      updateImportUiState();
    });
    aliasCommentInput?.addEventListener("input", updateImportUiState);

    pasteOrderText?.addEventListener("input", updateImportUiState);

    pasteOrderToggle?.addEventListener("click", () => {
      whatsappImportBox?.classList.toggle("hidden");
      updateImportUiState();
    });

    pasteOrderClear?.addEventListener("click", reset);

    pasteOrderApply?.addEventListener("click", processPasteText);

    // Estado inicial del UI de comentario.
    syncAliasCommentUi();
  };

  return { init, reset, updateImportUiState, renderPasteReport, processPasteText };
};
