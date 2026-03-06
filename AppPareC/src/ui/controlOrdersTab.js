const buildClientLabel = (row) => {
  const clientId = String(row?.clientId || "").trim();
  const clientName = String(row?.clientName || "").trim();
  if (clientId && clientName) {
    return `${clientId}) ${clientName}`;
  }
  return clientName || clientId || "Cliente s/n";
};

const formatItemLine = (item) => {
  const name = String(item?.productName || "").trim() || "Producto";
  const variant = String(item?.variant || "").trim();
  const qtyText = String(item?.quantityText || "").trim();
  const qtyNumber = Number(item?.quantity);
  const qty =
    qtyText ||
    (Number.isFinite(qtyNumber)
      ? (Number.isInteger(qtyNumber)
          ? String(qtyNumber)
          : String(Math.round(qtyNumber * 1000) / 1000).replace(".", ","))
      : "");
  const unit = String(item?.unit || "").trim();
  const notes = String(item?.notes || "").trim();

  const parts = [name];
  if (variant && variant !== "Común") {
    parts.push(variant);
  }
  if (qty) {
    parts.push(`${qty}${unit ? ` ${unit}` : ""}`);
  }
  if (notes) {
    parts.push(`.${notes}`);
  }
  return parts.join(" - ").trim();
};

export const createControlOrdersTab = ({
  ordersApi,
  tabCreateButton,
  tabControlButton,
  tabRepartoButton,
  createPane,
  controlPane,
  repartoPane,
  clientControlsBlock,
  pdfActionsBlock,
  createSummaryPane,
  onTabChanged,
  refreshButton,
  tableBody,
  statusNode,
}) => {
  const state = {
    activeTab: "create",
    loading: false,
    rows: [],
    openDetailKey: "",
  };

  const closeAllDetailPanels = () => {
    if (!tableBody) {
      return;
    }
    const wrappers = tableBody.querySelectorAll(".control-orders__detail");
    wrappers.forEach((wrapper) => {
      const panel = wrapper.querySelector(".control-orders__detail-panel");
      const toggle = wrapper.querySelector(".control-orders__toggle");
      if (panel) {
        panel.classList.add("hidden");
      }
      if (toggle) {
        toggle.textContent = "Expandir";
      }
    });
    state.openDetailKey = "";
  };

  const setStatus = (message, variant = "") => {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = String(message || "");
    statusNode.classList.remove("save-status--success", "save-status--error");
    if (variant === "success") {
      statusNode.classList.add("save-status--success");
    }
    if (variant === "error") {
      statusNode.classList.add("save-status--error");
    }
  };

  const setActiveTab = (tabName) => {
    const next = tabName === "control" || tabName === "reparto" ? tabName : "create";
    state.activeTab = next;

    const isCreate = next === "create";
    const isControl = next === "control";
    const isReparto = next === "reparto";

    createPane?.classList.toggle("hidden", !isCreate);
    controlPane?.classList.toggle("hidden", !isControl);
    repartoPane?.classList.toggle("hidden", !isReparto);

    clientControlsBlock?.classList.toggle("hidden", isControl);
    pdfActionsBlock?.classList.toggle("hidden", !isControl);
    createSummaryPane?.classList.toggle("hidden", !isCreate);

    tabCreateButton?.classList.toggle("tab-button--active", isCreate);
    tabControlButton?.classList.toggle("tab-button--active", isControl);
    tabRepartoButton?.classList.toggle("tab-button--active", isReparto);

    tabCreateButton?.setAttribute("aria-selected", String(isCreate));
    tabControlButton?.setAttribute("aria-selected", String(isControl));
    tabRepartoButton?.setAttribute("aria-selected", String(isReparto));

    if (isControl) {
      refresh();
    } else {
      closeAllDetailPanels();
    }

    if (typeof onTabChanged === "function") {
      onTabChanged(next);
    }
  };

  const updateRowsForClient = ({ clientId, approved, flete, dispatchRaw }) => {
    const cid = String(clientId || "").trim();
    if (!cid) {
      return;
    }
    state.rows = state.rows.map((row) => {
      if (String(row?.clientId || "").trim() !== cid) {
        return row;
      }
      return {
        ...row,
        approved: Boolean(approved),
        flete: String(flete || "Flete 1"),
        dispatchRaw: String(dispatchRaw || ""),
      };
    });
  };

  const persistRow = async ({
    row,
    approved,
    flete,
    rowStatusNode,
    checkboxNode,
    disableNodes = [],
    onSuccess,
    onError,
  }) => {
    if (!ordersApi || typeof ordersApi.updateTodayControlOrder !== "function") {
      return;
    }

    const previousApproved = Boolean(row?.approved);
    const previousFlete = String(row?.flete || "Flete 1");

    if (checkboxNode) {
      checkboxNode.disabled = true;
    }
    disableNodes.forEach((node) => {
      if (node) {
        node.disabled = true;
      }
    });
    if (rowStatusNode) {
      rowStatusNode.textContent = "Guardando...";
      rowStatusNode.classList.remove("save-status--success", "save-status--error");
    }

    try {
      const response = await ordersApi.updateTodayControlOrder({
        clientId: row?.clientId,
        approved,
        flete,
      });
      const payload = response?.data || {};
      updateRowsForClient({
        clientId: payload.clientId || row?.clientId,
        approved: payload.approved,
        flete: payload.flete,
        dispatchRaw: payload.dispatchRaw,
      });
      if (typeof onSuccess === "function") {
        onSuccess({
          approved: Boolean(payload?.approved),
          flete: String(payload?.flete || "Flete 1"),
        });
      }
      if (rowStatusNode) {
        rowStatusNode.textContent = "Guardado";
        rowStatusNode.classList.remove("save-status--error");
        rowStatusNode.classList.add("save-status--success");
      }
    } catch (error) {
      updateRowsForClient({
        clientId: row?.clientId,
        approved: previousApproved,
        flete: previousFlete,
        dispatchRaw: row?.dispatchRaw,
      });
      if (checkboxNode) {
        checkboxNode.checked = previousApproved;
      }
      if (typeof onError === "function") {
        onError({ approved: previousApproved, flete: previousFlete });
      }
      if (rowStatusNode) {
        rowStatusNode.textContent = String(error?.message || "No se pudo guardar.");
        rowStatusNode.classList.remove("save-status--success");
        rowStatusNode.classList.add("save-status--error");
      }
    } finally {
      if (checkboxNode) {
        checkboxNode.disabled = false;
      }
      disableNodes.forEach((node) => {
        if (node) {
          node.disabled = false;
        }
      });
    }
  };

  const renderRows = () => {
    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = "";

    if (!state.rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = "No hay pedidos completados para hoy.";
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }

    state.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.className = "control-orders__row";

      const rowKey = String(row?.orderId || "") || `${String(row?.clientId || "")}-row`;

      const tdApproved = document.createElement("td");
      tdApproved.className = "control-orders__col-approved";
      const approved = document.createElement("input");
      approved.type = "checkbox";
      approved.checked = Boolean(row?.approved);
      approved.disabled = !row?.mapped;
      tdApproved.appendChild(approved);

      const tdClient = document.createElement("td");
      tdClient.className = "control-orders__col-client";
      tdClient.textContent = buildClientLabel(row);

      const tdItems = document.createElement("td");
      tdItems.className = "control-orders__col-items";
      const itemsCount = Number(row?.itemsCount) || 0;
      tdItems.textContent = String(itemsCount);

      const tdFlete = document.createElement("td");
      tdFlete.className = "control-orders__col-flete";
      const fleteWrap = document.createElement("div");
      fleteWrap.className = "control-orders__flete-options";

      const currentFlete = String(row?.flete || "Flete 1");
      const flete1Button = document.createElement("button");
      flete1Button.type = "button";
      flete1Button.className = "control-orders__flete-option";
      flete1Button.textContent = "1";
      flete1Button.disabled = !row?.mapped;
      flete1Button.setAttribute("aria-pressed", String(currentFlete === "Flete 1"));

      const flete2Button = document.createElement("button");
      flete2Button.type = "button";
      flete2Button.className = "control-orders__flete-option";
      flete2Button.textContent = "2";
      flete2Button.disabled = !row?.mapped;
      flete2Button.setAttribute("aria-pressed", String(currentFlete === "Flete 2"));

      const applyFleteCellColor = (value) => {
        tdFlete.classList.remove("control-orders__col-flete--1", "control-orders__col-flete--2");
        if (value === "Flete 2") {
          tdFlete.classList.add("control-orders__col-flete--2");
          return;
        }
        tdFlete.classList.add("control-orders__col-flete--1");
      };

      const setFleteButtonsVisual = (value) => {
        const isOne = value !== "Flete 2";
        flete1Button.setAttribute("aria-pressed", String(isOne));
        flete2Button.setAttribute("aria-pressed", String(!isOne));
        flete1Button.classList.toggle("is-active", isOne);
        flete2Button.classList.toggle("is-active", !isOne);
      };

      applyFleteCellColor(currentFlete);
      setFleteButtonsVisual(currentFlete);

      fleteWrap.appendChild(flete1Button);
      fleteWrap.appendChild(flete2Button);
      tdFlete.appendChild(fleteWrap);

      const tdStatus = document.createElement("td");
      tdStatus.className = "save-status control-orders__col-status";
      tdStatus.textContent = row?.mapped ? "" : "Sin columna mapeada";
      if (!row?.mapped) {
        tdStatus.classList.add("save-status--error");
      }

      const persistSelection = (selectedFlete) => {
        persistRow({
          row,
          approved: approved.checked,
          flete: selectedFlete,
          rowStatusNode: tdStatus,
          checkboxNode: approved,
          disableNodes: [flete1Button, flete2Button],
          onSuccess: ({ approved: nextApproved, flete: nextFlete }) => {
            approved.checked = Boolean(nextApproved);
            setFleteButtonsVisual(String(nextFlete || "Flete 1"));
            applyFleteCellColor(String(nextFlete || "Flete 1"));
          },
          onError: ({ approved: previousApproved, flete: previousFlete }) => {
            approved.checked = Boolean(previousApproved);
            const safePrevious = String(previousFlete || "Flete 1");
            setFleteButtonsVisual(safePrevious);
            applyFleteCellColor(safePrevious);
          },
        });
      };

      flete1Button.addEventListener("click", () => {
        if (flete1Button.disabled) {
          return;
        }
        setFleteButtonsVisual("Flete 1");
        applyFleteCellColor("Flete 1");
        persistSelection("Flete 1");
      });

      flete2Button.addEventListener("click", () => {
        if (flete2Button.disabled) {
          return;
        }
        setFleteButtonsVisual("Flete 2");
        applyFleteCellColor("Flete 2");
        persistSelection("Flete 2");
      });

      const tdDetail = document.createElement("td");
      tdDetail.className = "control-orders__col-detail";
      const items = Array.isArray(row?.items) ? row.items : [];
      const orderedItems = [...items].sort(
        (a, b) => Number(a?.position || 0) - Number(b?.position || 0)
      );
      if (!orderedItems.length) {
        tdDetail.textContent = "Sin detalle";
      } else {
        const detailWrap = document.createElement("div");
        detailWrap.className = "control-orders__detail";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "button-secondary control-orders__toggle";
        toggle.textContent = "Expandir";

        const panel = document.createElement("div");
        panel.className = "control-orders__detail-panel hidden";

        const list = document.createElement("ol");
        list.className = "control-orders__items";
        orderedItems.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = formatItemLine(item);
          list.appendChild(li);
        });
        panel.appendChild(list);

        toggle.addEventListener("click", () => {
          const isOpeningCurrent = state.openDetailKey !== rowKey;
          closeAllDetailPanels();
          if (isOpeningCurrent) {
            panel.classList.remove("hidden");
            toggle.textContent = "Contraer";
            state.openDetailKey = rowKey;
          }
        });

        detailWrap.appendChild(toggle);
        detailWrap.appendChild(panel);
        tdDetail.appendChild(detailWrap);
      }

      approved.addEventListener("change", () => {
        persistRow({
          row,
          approved: approved.checked,
          flete: flete2Button.classList.contains("is-active") ? "Flete 2" : "Flete 1",
          rowStatusNode: tdStatus,
          checkboxNode: approved,
          disableNodes: [flete1Button, flete2Button],
          onSuccess: ({ approved: nextApproved, flete: nextFlete }) => {
            approved.checked = Boolean(nextApproved);
            setFleteButtonsVisual(String(nextFlete || "Flete 1"));
            applyFleteCellColor(String(nextFlete || "Flete 1"));
          },
          onError: ({ approved: previousApproved, flete: previousFlete }) => {
            approved.checked = Boolean(previousApproved);
            const safePrevious = String(previousFlete || "Flete 1");
            setFleteButtonsVisual(safePrevious);
            applyFleteCellColor(safePrevious);
          },
        });
      });

      tr.appendChild(tdApproved);
      tr.appendChild(tdClient);
      tr.appendChild(tdItems);
      tr.appendChild(tdFlete);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDetail);
      tableBody.appendChild(tr);
    });
  };

  const refresh = async () => {
    if (state.loading) {
      return;
    }
    if (!ordersApi || typeof ordersApi.listTodayControlOrders !== "function") {
      return;
    }

    state.loading = true;
    if (refreshButton) {
      refreshButton.disabled = true;
    }
    setStatus("Cargando pedidos del día...");

    try {
      const result = await ordersApi.listTodayControlOrders();
      state.rows = Array.isArray(result?.data) ? result.data : [];
      renderRows();
      setStatus(`Pedidos cargados: ${state.rows.length}.`, "success");
    } catch (error) {
      state.rows = [];
      renderRows();
      setStatus(String(error?.message || "No se pudieron cargar pedidos."), "error");
    } finally {
      state.loading = false;
      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  };

  const init = () => {
    tabCreateButton?.addEventListener("click", () => setActiveTab("create"));
    tabControlButton?.addEventListener("click", () => setActiveTab("control"));
    tabRepartoButton?.addEventListener("click", () => setActiveTab("reparto"));
    refreshButton?.addEventListener("click", () => refresh());

    tableBody?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".control-orders__detail")) {
        return;
      }
      closeAllDetailPanels();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("#control-orders-pane")) {
        return;
      }
      closeAllDetailPanels();
    });

    setActiveTab("create");
  };

  return {
    init,
    refresh,
    setActiveTab,
  };
};
