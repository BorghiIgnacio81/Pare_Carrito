import { createClientsModel } from "./clientsModel.js";
import { createResponsiblesModel } from "./responsiblesModel.js";
import { createClientResponsiblesModel } from "./clientResponsiblesModel.js";

export const createDbModels = ({ pool }) => {
  return {
    clients: createClientsModel({ pool }),
    responsibles: createResponsiblesModel({ pool }),
    clientResponsibles: createClientResponsiblesModel({ pool }),
  };
};
