import { buildDivisionComprasSnapshot } from "../services/divisionComprasService.js";

export const createDivisionComprasController = ({
  fetchSheetValues,
  SHEET_NAME,
}) => {
  const handleTodaySnapshot = async (req, res) => {
    try {
      const includeRows = String(req.query.includeRows || "") === "1";
      const requestedDate = String(req.query.date || "").trim();
      const sectionRulesRaw =
        String(process.env.DIVISION_COMPRAS_SECTIONS_JSON || "").trim() ||
        String(req.query.sectionRules || "").trim();

      const { values, warning } = await fetchSheetValues();
      const snapshot = buildDivisionComprasSnapshot({
        values,
        date: requestedDate,
        sectionRulesRaw,
        includeRows,
      });

      res.json({
        ok: true,
        source: {
          sheetName: SHEET_NAME,
          warning: warning || null,
        },
        ...snapshot,
      });
    } catch (error) {
      console.error("/api/division-compras/today failed:", error);
      res.status(500).json({ ok: false, error: String(error?.message || error) });
    }
  };

  return {
    handleTodaySnapshot,
  };
};