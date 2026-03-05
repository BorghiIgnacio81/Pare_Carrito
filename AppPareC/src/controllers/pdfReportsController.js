export const createPdfReportsController = ({
  getDocsClient,
  getDriveClient,
  TASKS_DOC_ID,
  PRINT_DOC_ID,
  fetchDivCompRanges,
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
}) => {
  const handleTareasPdf = async (req, res) => {
    try {
      const today = formatDate(new Date());
      if (!TASKS_DOC_ID) {
        res.status(500).send("Missing TAREAS_DOC_ID/TASKS_DOC_ID.");
        return;
      }

      const ranges = await fetchDivCompRanges();
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

      const refreshedDoc = await docs.documents.get({ documentId: TASKS_DOC_ID });
      const dateTokens = extractDateTokensFromDocHeaderFooter(refreshedDoc).filter(
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
      if (!PRINT_DOC_ID) {
        res.status(500).send("Missing IMPRESION_DOC_ID/PRINT_DOC_ID.");
        return;
      }

      const [traficA, traficGH, kangooA, kangooGH, kangooA4] = await Promise.all([
        fetchRangeRows(PRINT_SHEET_TRAFFIC, "A4:A2000"),
        fetchRangeRows(PRINT_SHEET_TRAFFIC, "G6:H2000"),
        fetchRangeRows(PRINT_SHEET_KANGOO, "A4:A2000"),
        fetchRangeRows(PRINT_SHEET_KANGOO, "G6:H2000"),
        fetchSingleCell(PRINT_SHEET_KANGOO, "A4"),
      ]);

      const flete1Rows = sliceToThirdEmpty([...traficA, [], [], []]);
      const suma1Rows = sliceToFirstEmpty([...traficGH, []]);
      const flete2Rows = sliceToThirdEmpty([...kangooA, [], [], []]);
      const suma2Rows = sliceToFirstEmpty([...kangooGH, []]);

      const flete1Text = rowsToPlainText(flete1Rows);
      const suma1Text = rowsToPlainText(suma1Rows);
      const flete2Text = rowsToPlainText(flete2Rows);
      const suma2Text = rowsToPlainText(suma2Rows);
      const hasFlete2 = String(kangooA4 ?? "").trim() !== "#N/A";

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
      }

      doc = await docs.documents.get({ documentId: PRINT_DOC_ID });

      if (!hasFlete2) {
        const updatedFlete2 = findMarkerRange(doc, [
          /(^|\n)\s*FLETE\s*2\b/i,
          /(^|\n)\s*FLETE\s*II\b/i,
          /FLETE\s*2\b/i,
        ]);
        const updatedEnd = getDocumentEndIndex(doc);
        if (updatedFlete2 && updatedEnd > updatedFlete2.startIndex) {
          await docs.documents.batchUpdate({
            documentId: PRINT_DOC_ID,
            requestBody: {
              requests: [
                {
                  deleteContentRange: {
                    range: { startIndex: updatedFlete2.startIndex, endIndex: updatedEnd },
                  },
                },
              ],
            },
          });
        }
      } else {
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
      }

      const drive = await getDriveClient();
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