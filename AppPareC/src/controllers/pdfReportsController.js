export const createPdfReportsController = ({
  getDocsClient,
  getDriveClient,
  TASKS_DOC_ID,
  PRINT_DOC_ID,
  fetchDivCompRanges,
  fetchTasksRangesFromBackend,
  buildTasksDocumentPayload,
  extractDateTokensFromDocHeaderFooter,
  formatDate,
  findMarkerRange,
  getDocumentEndIndex,
  rowsToPlainText,
  sliceToFirstEmpty,
  sliceToThirdEmpty,
  fetchRangeRows,
  fetchSingleCell,
  PRINT_SHEET_TRAFFIC,
  PRINT_SHEET_KANGOO,
  savePdfBufferInProject,
  TAREAS_PDF_DIR,
  IMPRIMIR_PEDIDOS_PDF_DIR,
  fetchTodosDispatchByClient,
  fetchActiveClientIdsFromTodos,
  getOrdersForDate,
}) => {
  const columnToIndex = (column) => {
    const text = String(column || "").trim().toUpperCase();
    if (!text) {
      return Number.MAX_SAFE_INTEGER;
    }
    let acc = 0;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 65 || code > 90) {
        return Number.MAX_SAFE_INTEGER;
      }
      acc = acc * 26 + (code - 64);
    }
    return acc;
  };

  const formatQty = (item) => {
    const quantityText = String(item?.quantityText || "").trim();
    if (quantityText) {
      return quantityText;
    }
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "";
    }
    if (Number.isInteger(quantity)) {
      return String(quantity);
    }
    return String(Math.round(quantity * 1000) / 1000).replace(".", ",");
  };

  const formatItemLine = (item) => {
    const product = String(item?.productName || "Producto").trim() || "Producto";
    const variant = String(item?.variant || "").trim();
    const qty = formatQty(item);
    const unit = String(item?.unit || "").trim();
    const notes = String(item?.notes || "").trim();

    const variantPart = variant && variant !== "Común" ? ` ${variant}` : "";
    const qtyPart = qty ? ` - ${qty}${unit ? ` ${unit}` : ""}` : "";
    const notePart = notes ? ` .${notes}` : "";
    return `${product}${variantPart}${qtyPart}${notePart}`.trim();
  };

  const rowsToPlainTextKeepingBlanks = (rows) =>
    (rows || [])
      .map((row) => (row || []).map((cell) => String(cell ?? "")).join("\t").trimEnd())
      .join("\n");

  const buildRouteRowsFromDb = ({ orders, dispatchByClient }) => {
    const routes = {
      Trafic: { clients: new Map(), productTotals: new Map() },
      Kangoo: { clients: new Map(), productTotals: new Map() },
    };

    const addProductTotal = (route, item) => {
      const productName = String(item?.productName || "").trim();
      const variant = String(item?.variant || "").trim();
      const safeName = variant && variant !== "Común" ? `${productName} - ${variant}` : productName;
      if (!safeName) {
        return;
      }
      const qty = Number(item?.quantity);
      const safeUnit = String(item?.unit || "").trim().toLowerCase();
      const currentEntry = route.productTotals.get(safeName) || { total: 0, unit: "" };
      const current = Number(currentEntry.total || 0);
      const next = Number.isFinite(qty) && qty > 0 ? current + qty : current;
      route.productTotals.set(safeName, {
        total: next,
        unit: currentEntry.unit || safeUnit,
      });
    };

    (Array.isArray(orders) ? orders : []).forEach((order) => {
      const clientId = String(order?.clientId || "").trim();
      if (!clientId) {
        return;
      }

      const routing = dispatchByClient?.[clientId] || null;
      const target = routing?.dispatchTarget === "Kangoo" ? "Kangoo" : "Trafic";
      const route = routes[target];
      const clientName =
        String(order?.clientName || "").trim() ||
        String(routing?.clientLabel || "").trim() ||
        `Cliente ${clientId}`;
      const clientLabel = `${clientId}) ${clientName}`;
      const clientSortIndex = columnToIndex(routing?.column || "");

      if (!route.clients.has(clientLabel)) {
        route.clients.set(clientLabel, { sortIndex: clientSortIndex, lines: [] });
      }

      const itemList = route.clients.get(clientLabel);
      if (clientSortIndex < itemList.sortIndex) {
        itemList.sortIndex = clientSortIndex;
      }
      (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
        itemList.lines.push(formatItemLine(item));
        addProductTotal(route, item);
      });
    });

    const toRows = (routeData) => {
      const fleteRows = [];
      const orderedClients = Array.from(routeData.clients.entries())
        .map(([client, meta]) => ({ client, sortIndex: meta.sortIndex, lines: meta.lines }))
        .sort((a, b) => {
          const diff = Number(a.sortIndex) - Number(b.sortIndex);
          if (diff !== 0) {
            return diff;
          }
          return a.client.localeCompare(b.client, "es");
        });

      orderedClients.forEach(({ client, lines }) => {
        fleteRows.push([client]);
        lines.forEach((line) => fleteRows.push([line]));
        fleteRows.push([]);
      });

      const sumaRows = Array.from(routeData.productTotals.entries())
        .filter(([, entry]) => Number(entry?.total) > 0)
        .sort((a, b) => String(a[0] || "").localeCompare(String(b[0] || ""), "es"))
        .map(([product, entry]) => {
          const total = Number(entry?.total || 0);
          const totalText = String(Math.round(total * 1000) / 1000).replace(".", ",");
          const unit = String(entry?.unit || "").trim();
          return [`${product} = ${totalText}${unit ? ` ${unit}` : ""}`];
        });

      return { fleteRows, sumaRows };
    };

    const trafic = toRows(routes.Trafic);
    const kangoo = toRows(routes.Kangoo);

    return {
      flete1Rows: trafic.fleteRows,
      suma1Rows: trafic.sumaRows,
      flete2Rows: kangoo.fleteRows,
      suma2Rows: kangoo.sumaRows,
      hasFlete2: kangoo.fleteRows.length > 0,
      sourceMode: "db+todos-routing",
    };
  };

  const getPrintSourceRows = async () => {
    const canUseDbMode =
      typeof getOrdersForDate === "function" && typeof fetchTodosDispatchByClient === "function";

    if (canUseDbMode) {
      try {
        const [orders, dispatchByClient, activeClientIds] = await Promise.all([
          getOrdersForDate({ date: new Date() }),
          fetchTodosDispatchByClient(),
          typeof fetchActiveClientIdsFromTodos === "function"
            ? fetchActiveClientIdsFromTodos()
            : Promise.resolve([]),
        ]);
        const activeSet = new Set(
          (Array.isArray(activeClientIds) ? activeClientIds : []).map((id) => String(id).trim())
        );
        const filteredOrders = Array.isArray(orders)
          ? orders.filter((order) => activeSet.has(String(order?.clientId || "").trim()))
          : [];
        const dbRows = buildRouteRowsFromDb({ orders: filteredOrders, dispatchByClient });
        if (dbRows.flete1Rows.length || dbRows.flete2Rows.length) {
          return dbRows;
        }
      } catch {
      }
    }

    const [traficA, traficGH, kangooA, kangooGH, kangooA4] = await Promise.all([
      fetchRangeRows(PRINT_SHEET_TRAFFIC, "A4:A2000"),
      fetchRangeRows(PRINT_SHEET_TRAFFIC, "G6:H2000"),
      fetchRangeRows(PRINT_SHEET_KANGOO, "A4:A2000"),
      fetchRangeRows(PRINT_SHEET_KANGOO, "G6:H2000"),
      fetchSingleCell(PRINT_SHEET_KANGOO, "A4"),
    ]);

    return {
      flete1Rows: sliceToThirdEmpty([...traficA, [], [], []]),
      suma1Rows: sliceToFirstEmpty([...traficGH, []]),
      flete2Rows: sliceToThirdEmpty([...kangooA, [], [], []]),
      suma2Rows: sliceToFirstEmpty([...kangooGH, []]),
      hasFlete2: String(kangooA4 ?? "").trim() !== "#N/A",
      sourceMode: "legacy-sheets",
    };
  };

  const handleTareasPdf = async (req, res) => {
    try {
      const today = formatDate(new Date());
      if (!TASKS_DOC_ID) {
        res.status(500).send("Missing TAREAS_DOC_ID/TASKS_DOC_ID.");
        return;
      }

      const hasRowsContent = (rows) => {
        const list = Array.isArray(rows) ? rows : [];
        return list.some((row) => {
          if (Array.isArray(row)) {
            return row.some((cell) => String(cell ?? "").trim());
          }
          return String(row ?? "").trim().length > 0;
        });
      };

      const hasRangesContent = (candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return false;
        }
        return ["part1", "part2", "part3", "part4"].some((key) => hasRowsContent(candidate[key]));
      };

      let ranges = null;
      let backendRanges = null;
      if (typeof fetchTasksRangesFromBackend === "function") {
        try {
          backendRanges = await fetchTasksRangesFromBackend();
        } catch {
          backendRanges = null;
        }
      }

      if (hasRangesContent(backendRanges)) {
        ranges = backendRanges;
      } else {
        ranges = await fetchDivCompRanges();
      }
      const payload = buildTasksDocumentPayload(ranges);

      const docs = await getDocsClient();
      const doc = await docs.documents.get({ documentId: TASKS_DOC_ID });
      const content = Array.isArray(doc?.data?.body?.content) ? doc.data.body.content : [];
      const last = content.length ? content[content.length - 1] : null;
      const endIndex = last?.endIndex ? Number(last.endIndex) : 1;

      const requests = [];
      if (endIndex > 1) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex: endIndex - 1 },
          },
        });
      }
      requests.push({
        insertText: {
          location: { index: 1 },
          text: payload.text,
        },
      });

      if (payload.text) {
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: 1,
              endIndex: 1 + payload.text.length,
            },
            textStyle: { bold: false },
            fields: "bold",
          },
        });
      }

      payload.boldRanges.forEach((range) => {
        requests.push({
          updateTextStyle: {
            range: {
              startIndex: 1 + range.start,
              endIndex: 1 + range.end,
            },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
      });

      await docs.documents.batchUpdate({
        documentId: TASKS_DOC_ID,
        requestBody: { requests },
      });

      const robertoStartOffset = Number(payload?.robertoStartOffset);
      const robertoStartIndex =
        Number.isFinite(robertoStartOffset) && robertoStartOffset > 0
          ? 1 + robertoStartOffset
          : null;

      if (robertoStartIndex && robertoStartIndex > 1) {
        await docs.documents.batchUpdate({
          documentId: TASKS_DOC_ID,
          requestBody: {
            requests: [
              {
                insertPageBreak: {
                  location: { index: robertoStartIndex },
                },
              },
            ],
          },
        });
      } else {
        const refreshedDoc = await docs.documents.get({ documentId: TASKS_DOC_ID });
        const robertoSectionMarker = findMarkerRange(refreshedDoc, [
          /(^|\n)\s*Roberto(?:\t|\s|$)/i,
        ]);
        if (robertoSectionMarker?.startIndex && robertoSectionMarker.startIndex > 1) {
          await docs.documents.batchUpdate({
            documentId: TASKS_DOC_ID,
            requestBody: {
              requests: [
                {
                  insertPageBreak: {
                    location: { index: robertoSectionMarker.startIndex },
                  },
                },
              ],
            },
          });
        }
      }

      const docAfterPageBreak = await docs.documents.get({ documentId: TASKS_DOC_ID });
      const dateTokens = extractDateTokensFromDocHeaderFooter(docAfterPageBreak).filter(
        (token) => token && token !== today
      );
      if (dateTokens.length) {
        await docs.documents.batchUpdate({
          documentId: TASKS_DOC_ID,
          requestBody: {
            requests: dateTokens.map((token) => ({
              replaceAllText: {
                containsText: {
                  text: token,
                  matchCase: true,
                },
                replaceText: today,
              },
            })),
          },
        });
      }

      const drive = await getDriveClient();
      const pdf = await drive.files.export(
        { fileId: TASKS_DOC_ID, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );

      const pdfBuffer = Buffer.from(pdf.data);
      if (String(req.query.saveInProject || "") === "1") {
        const saved = savePdfBufferInProject({
          buffer: pdfBuffer,
          folderPath: TAREAS_PDF_DIR,
          baseName: "tareas",
        });
        res.json({
          ok: true,
          sourceMode: String(ranges?.sourceMode || "legacy-sheets"),
          savedAt: {
            filePath: saved.filePath,
          },
        });
        return;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="tareas.pdf"');
      res.status(200).send(pdfBuffer);
    } catch (error) {
      console.error("/api/tareas/pdf failed:", error);
      res.status(500).send(String(error?.message || error));
    }
  };

  const handleImprimirPedidosPdf = async (req, res) => {
    try {
      const today = formatDate(new Date());
      if (!PRINT_DOC_ID) {
        res.status(500).send("Missing IMPRESION_DOC_ID/PRINT_DOC_ID.");
        return;
      }
      const printSourceRows = await getPrintSourceRows();
      const flete1Rows = printSourceRows.flete1Rows;
      const suma1Rows = printSourceRows.suma1Rows;
      const flete2Rows = printSourceRows.flete2Rows;
      const suma2Rows = printSourceRows.suma2Rows;

      const flete1Text = rowsToPlainTextKeepingBlanks(flete1Rows);
      const suma1Text = rowsToPlainText(suma1Rows);
      const flete2Text = rowsToPlainTextKeepingBlanks(flete2Rows);
      const suma2Text = rowsToPlainText(suma2Rows);
      const hasFlete2 = Boolean(printSourceRows.hasFlete2);

      const docs = await getDocsClient();
      let doc = await docs.documents.get({ documentId: PRINT_DOC_ID });

      const buildSectionRequests = (fromMarker, toMarker, text, addBlankAfter = false) => {
        const requestList = [];
        const startIndex = fromMarker.endIndex;
        const endIndex = toMarker.startIndex;
        if (endIndex > startIndex) {
          requestList.push({
            deleteContentRange: {
              range: { startIndex, endIndex },
            },
          });
        }
        const tail = addBlankAfter ? "\n\n" : "\n";
        const payload = text ? `\n${text}${tail}` : `\n${tail}`;
        requestList.push({
          insertText: {
            location: { index: startIndex },
            text: payload,
          },
        });
        return requestList;
      };

      const applySectionBetween = async (fromMarker, toMarker, text, addBlankAfter = false) => {
        const requests = buildSectionRequests(fromMarker, toMarker, text, addBlankAfter);
        if (!requests.length) {
          return;
        }
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: { requests },
        });
      };

      const applyBlackTextBetween = async (fromMarker, toMarker) => {
        if (!fromMarker || !toMarker) {
          return;
        }
        const startIndex = Number(fromMarker.endIndex || 0);
        const endIndex = Number(toMarker.startIndex || 0);
        if (!(endIndex > startIndex)) {
          return;
        }
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  range: { startIndex, endIndex },
                  textStyle: {
                    foregroundColor: {
                      color: {
                        rgbColor: { red: 0, green: 0, blue: 0 },
                      },
                    },
                  },
                  fields: "foregroundColor",
                },
              },
            ],
          },
        });
      };

      const flete1Marker = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*1\b/i,
        /(^|\n)\s*FLETE\s*I\b/i,
        /FLETE\s*1\b/i,
      ]);
      const suma1Marker = findMarkerRange(doc, [
        /(^|\n)\s*SUMA\s+FLETE\s*1\b/i,
        /(^|\n)\s*SUMA\s+FLETE\s*I\b/i,
        /SUMA\s+FLETE\s*1\b/i,
      ]);
      if (!flete1Marker || !suma1Marker) {
        throw new Error("No se encontraron marcadores de FLETE 1 en el Doc.");
      }

      const flete2Marker = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      await applySectionBetween(flete1Marker, suma1Marker, flete1Text, true);

      doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
      const updatedSuma1 = findMarkerRange(doc, [
        /(^|\n)\s*SUMA\s+FLETE\s*1\b/i,
        /(^|\n)\s*SUMA\s+FLETE\s*I\b/i,
        /SUMA\s+FLETE\s*1\b/i,
      ]);
      if (!updatedSuma1) {
        throw new Error("No se encontró marcador SUMA FLETE 1 luego de actualizar FLETE 1.");
      }

      const updatedFlete2Marker = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      if (updatedFlete2Marker) {
        await applySectionBetween(updatedSuma1, updatedFlete2Marker, suma1Text, false);

        doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
        const suma1ForColor = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*1\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*I\b/i,
          /SUMA\s+FLETE\s*1\b/i,
        ]);
        const flete2ForColor = findMarkerRange(doc, [
          /(^|\n)\s*FLETE\s*2\b/i,
          /(^|\n)\s*FLETE\s*II\b/i,
          /FLETE\s*2\b/i,
        ]);
        await applyBlackTextBetween(suma1ForColor, flete2ForColor);
      } else {
        const docEndIndex = getDocumentEndIndex(doc);
        const requestsTail = [];
        if (docEndIndex > updatedSuma1.endIndex) {
          requestsTail.push({
            deleteContentRange: {
              range: { startIndex: updatedSuma1.endIndex, endIndex: docEndIndex },
            },
          });
        }
        const payload = suma1Text ? `\n${suma1Text}\n` : "\n";
        requestsTail.push({
          insertText: {
            location: { index: updatedSuma1.endIndex },
            text: payload,
          },
        });
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: { requests: requestsTail },
        });

        doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
        const suma1ForColor = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*1\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*I\b/i,
          /SUMA\s+FLETE\s*1\b/i,
        ]);
        const endMarker = { startIndex: getDocumentEndIndex(doc), endIndex: getDocumentEndIndex(doc) };
        await applyBlackTextBetween(suma1ForColor, endMarker);
      }

      doc = await docs.documents.get({ documentId: PRINT_DOC_ID });

      if (!hasFlete2) {
        const updatedFlete2 = findMarkerRange(doc, [
          /(^|\n)\s*FLETE\s*2\b/i,
          /(^|\n)\s*FLETE\s*II\b/i,
          /FLETE\s*2\b/i,
        ]);
        const updatedSuma2 = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
          /SUMA\s+FLETE\s*2\b/i,
        ]);
        if (updatedFlete2 && updatedSuma2) {
          await applySectionBetween(updatedFlete2, updatedSuma2, "", true);

          doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
          const latestSuma2 = findMarkerRange(doc, [
            /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
            /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
            /SUMA\s+FLETE\s*2\b/i,
          ]);
          const endAfterSuma2 = getDocumentEndIndex(doc);
          if (latestSuma2 && endAfterSuma2 > latestSuma2.endIndex) {
            await docs.documents.batchUpdate({
              documentId: PRINT_DOC_ID,
              requestBody: {
                requests: [
                  {
                    deleteContentRange: {
                      range: { startIndex: latestSuma2.endIndex, endIndex: endAfterSuma2 },
                    },
                  },
                  {
                    insertText: {
                      location: { index: latestSuma2.endIndex },
                      text: "\n",
                    },
                  },
                ],
              },
            });
          }
        }
      } else {
        let updatedFlete2 = findMarkerRange(doc, [
          /(^|\n)\s*FLETE\s*2\b/i,
          /(^|\n)\s*FLETE\s*II\b/i,
          /FLETE\s*2\b/i,
        ]);
        let updatedSuma2 = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
          /SUMA\s+FLETE\s*2\b/i,
        ]);

        if (!updatedFlete2 || !updatedSuma2) {
          const docEndIndex = getDocumentEndIndex(doc);
          await docs.documents.batchUpdate({
            documentId: PRINT_DOC_ID,
            requestBody: {
              requests: [
                {
                  insertText: {
                    location: { index: docEndIndex },
                    text: "\nFLETE 2\n\nSUMA FLETE 2\n",
                  },
                },
              ],
            },
          });

          doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
          updatedFlete2 = findMarkerRange(doc, [
            /(^|\n)\s*FLETE\s*2\b/i,
            /(^|\n)\s*FLETE\s*II\b/i,
            /FLETE\s*2\b/i,
          ]);
          updatedSuma2 = findMarkerRange(doc, [
            /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
            /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
            /SUMA\s+FLETE\s*2\b/i,
          ]);
        }

        if (!updatedFlete2 || !updatedSuma2) {
          throw new Error("No se encontraron marcadores de FLETE 2 en el Doc.");
        }

        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: {
            requests: [
              {
                insertPageBreak: {
                  location: { index: updatedFlete2.startIndex },
                },
              },
            ],
          },
        });

        doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
        const finalFlete2 = findMarkerRange(doc, [
          /(^|\n)\s*FLETE\s*2\b/i,
          /(^|\n)\s*FLETE\s*II\b/i,
          /FLETE\s*2\b/i,
        ]);
        const finalSuma2 = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
          /SUMA\s+FLETE\s*2\b/i,
        ]);
        if (!finalFlete2 || !finalSuma2) {
          throw new Error("No se encontraron marcadores de FLETE 2 en el Doc.");
        }

        await applySectionBetween(finalFlete2, finalSuma2, flete2Text, true);

        doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
        const latestSuma2 = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
          /SUMA\s+FLETE\s*2\b/i,
        ]);
        if (!latestSuma2) {
          throw new Error("No se encontró marcador SUMA FLETE 2 luego de actualizar FLETE 2.");
        }

        const endAfterSuma2 = getDocumentEndIndex(doc);
        const requests2 = [];
        if (endAfterSuma2 > latestSuma2.endIndex) {
          requests2.push({
            deleteContentRange: {
              range: { startIndex: latestSuma2.endIndex, endIndex: endAfterSuma2 },
            },
          });
        }
        const suma2Payload = suma2Text ? `\n${suma2Text}\n` : "\n";
        requests2.push({
          insertText: {
            location: { index: latestSuma2.endIndex },
            text: suma2Payload,
          },
        });
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: { requests: requests2 },
        });

        doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
        const suma2ForColor = findMarkerRange(doc, [
          /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
          /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
          /SUMA\s+FLETE\s*2\b/i,
        ]);
        const docEndMarker = { startIndex: getDocumentEndIndex(doc), endIndex: getDocumentEndIndex(doc) };
        await applyBlackTextBetween(suma2ForColor, docEndMarker);
      }

      const drive = await getDriveClient();
      const refreshedDoc = await docs.documents.get({ documentId: PRINT_DOC_ID });

      const bodyContent = Array.isArray(refreshedDoc?.data?.body?.content)
        ? refreshedDoc.data.body.content
        : [];
      const bodyLast = bodyContent.length ? bodyContent[bodyContent.length - 1] : null;
      const bodyEndIndexRaw = Number(bodyLast?.endIndex || 1);
      if (bodyEndIndexRaw > 2) {
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  range: { startIndex: 1, endIndex: bodyEndIndexRaw - 1 },
                  textStyle: { bold: false },
                  fields: "bold",
                },
              },
            ],
          },
        });
      }

      const docAfterBoldCleanup = await docs.documents.get({ documentId: PRINT_DOC_ID });
      const redTitleColor = {
        foregroundColor: {
          color: {
            rgbColor: { red: 1, green: 0, blue: 0 },
          },
        },
      };
      const flete2TitleMarker = findMarkerRange(docAfterBoldCleanup, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      const suma2TitleMarker = findMarkerRange(docAfterBoldCleanup, [
        /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
        /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
        /SUMA\s+FLETE\s*2\b/i,
      ]);

      const redTitleRequests = [];
      if (flete2TitleMarker?.startIndex && flete2TitleMarker?.endIndex) {
        redTitleRequests.push({
          updateTextStyle: {
            range: {
              startIndex: flete2TitleMarker.startIndex,
              endIndex: flete2TitleMarker.endIndex,
            },
            textStyle: {
              ...redTitleColor,
              bold: false,
            },
            fields: "foregroundColor,bold",
          },
        });
      }
      if (suma2TitleMarker?.startIndex && suma2TitleMarker?.endIndex) {
        redTitleRequests.push({
          updateTextStyle: {
            range: {
              startIndex: suma2TitleMarker.startIndex,
              endIndex: suma2TitleMarker.endIndex,
            },
            textStyle: {
              ...redTitleColor,
              bold: false,
            },
            fields: "foregroundColor,bold",
          },
        });
      }
      if (redTitleRequests.length) {
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: { requests: redTitleRequests },
        });
      }

      const dateTokens = extractDateTokensFromDocHeaderFooter(refreshedDoc).filter(
        (token) => token && token !== today
      );
      if (dateTokens.length) {
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: {
            requests: dateTokens.map((token) => ({
              replaceAllText: {
                containsText: {
                  text: token,
                  matchCase: true,
                },
                replaceText: today,
              },
            })),
          },
        });
      }

      const pdf = await drive.files.export(
        { fileId: PRINT_DOC_ID, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );

      const pdfBuffer = Buffer.from(pdf.data);
      if (String(req.query.saveInProject || "") === "1") {
        const saved = savePdfBufferInProject({
          buffer: pdfBuffer,
          folderPath: IMPRIMIR_PEDIDOS_PDF_DIR,
          baseName: "imprimir-pedidos",
        });
        res.json({
          ok: true,
          sourceMode: printSourceRows.sourceMode,
          savedAt: {
            filePath: saved.filePath,
          },
        });
        return;
      }

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="imprimir-pedidos.pdf"');
      res.status(200).send(pdfBuffer);
    } catch (error) {
      console.error("/api/imprimir-pedidos/pdf failed:", error);
      res.status(500).send(String(error?.message || error));
    }
  };

  return {
    handleTareasPdf,
    handleImprimirPedidosPdf,
  };
};