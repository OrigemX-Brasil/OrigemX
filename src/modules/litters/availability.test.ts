import { describe, expect, it } from "vitest";

import { countAvailableBySex, describeAvailability } from "./availability";

const macho = (litter_status: string | null) => ({ sex: "male", litter_status });
const femea = (litter_status: string | null) => ({ sex: "female", litter_status });

describe("countAvailableBySex", () => {
  it("lista vazia dá zero nos dois", () => {
    expect(countAvailableBySex([])).toEqual({ males: 0, females: 0 });
  });

  it("conta só quem está 'available'", () => {
    expect(
      countAvailableBySex([
        macho("available"),
        macho("available"),
        macho("sold"),
        femea("available"),
        femea("reserved"),
      ]),
    ).toEqual({ males: 2, females: 1 });
  });

  it("reservado e vendido NÃO contam como disponível", () => {
    expect(countAvailableBySex([macho("reserved"), femea("sold")])).toEqual({
      males: 0,
      females: 0,
    });
  });

  it("status nulo (cão fora de ninhada) não conta", () => {
    expect(countAvailableBySex([macho(null), femea(null)])).toEqual({ males: 0, females: 0 });
  });

  it("sexo desconhecido não entra em nenhum dos dois lados", () => {
    expect(countAvailableBySex([{ sex: "", litter_status: "available" }])).toEqual({
      males: 0,
      females: 0,
    });
  });
});

describe("describeAvailability", () => {
  it("nenhum disponível devolve null — a seção some", () => {
    expect(describeAvailability({ males: 0, females: 0 })).toBeNull();
  });

  it("junta os dois sexos com 'e'", () => {
    expect(describeAvailability({ males: 2, females: 1 })).toBe("2 machos e 1 fêmea");
  });

  it("omite o sexo que zerou", () => {
    expect(describeAvailability({ males: 3, females: 0 })).toBe("3 machos");
    expect(describeAvailability({ males: 0, females: 2 })).toBe("2 fêmeas");
  });

  it("singular e plural corretos", () => {
    expect(describeAvailability({ males: 1, females: 1 })).toBe("1 macho e 1 fêmea");
  });
});
