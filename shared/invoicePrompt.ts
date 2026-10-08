// Instrucciones para leer albaranes con IA (las usan el artifact y el backend).
export const INVOICE_PROMPT = `Eres un asistente que lee albaranes/facturas de un distribuidor de bebidas en España.
Extrae TODAS las líneas de la imagen. No inventes nada: si un valor no se lee con claridad pon null.
Columnas habituales: Código, Descripción, Cajas (bultos), Unidades, % IVA, Precio unitario, Descuento (importe), Importe.
Las líneas de "Envases" (p. ej. "ENVASE SAN MIGUEL COMPL.") van con isContainer=true. Las cantidades negativas son devoluciones: mantenlas negativas.
Responde SOLO con JSON con esta forma:
{"supplier": string, "date": "YYYY-MM-DD", "reference": string,
 "lines": [{"code": string, "description": string, "boxes": number|null, "units": number|null, "vatRate": number|null,
            "unitPrice": number|null, "discount": number|null, "total": number|null, "isContainer": boolean}],
 "totals": {"products": number|null, "containers": number|null, "service": number|null, "greenPoint": number|null, "total": number|null},
 "notes": string}
Usa punto decimal en los números (1.516,06 → 1516.06).`;
