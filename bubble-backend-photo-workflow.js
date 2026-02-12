(async () => {
  const startedAt = Date.now();
  const logs = [];
  const errors = [];
  const createdPhotoIds = [];
  const updatedPhotoIds = [];
  const uploadedUrlsAll = [];

  function maskValue(value) {
    const s = String(value || "").trim();
    if (!s) return "<empty>";
    if (s.length <= 8) return `${s.slice(0, 2)}***`;
    return `${s.slice(0, 4)}...${s.slice(-4)}`;
  }

  function pushLog(message) {
    logs.push(String(message));
  }

  function pushError(message, extra) {
    const line = extra ? `${message} :: ${extra}` : message;
    errors.push(line);
    logs.push(`[error] ${line}`);
  }

  function safeJsonParse(value) {
    if (typeof value !== "string") return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  function getContainerValue(container, key) {
    if (!container || typeof container !== "object") return undefined;
    if (container[key] !== undefined && container[key] !== null) return container[key];

    const target = String(key).trim().toLowerCase();
    const keys = Object.keys(container);
    const foundKey = keys.find((k) => String(k).trim().toLowerCase() === target);
    if (foundKey) return container[foundKey];

    return undefined;
  }

  function unwrapListWrapper(value) {
    if (value === undefined || value === null) return value;

    if (typeof value === "object") {
      const q = getContainerValue(value, "query");
      const qData = getContainerValue(q, "data");
      if (Array.isArray(qData)) return qData.length === 1 ? qData[0] : qData;
      return value;
    }

    if (typeof value === "string") {
      const parsed = safeJsonParse(value);
      if (parsed && typeof parsed === "object") {
        const q = getContainerValue(parsed, "query");
        const qData = getContainerValue(q, "data");
        if (Array.isArray(qData)) return qData.length === 1 ? qData[0] : qData;
      }
    }

    return value;
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && !value.trim()) continue;
      return value;
    }
    return undefined;
  }

  function normalizeMapFromEntries(entries) {
    const out = {};
    for (const item of entries || []) {
      if (!item || typeof item !== "object") continue;
      const key = firstNonEmpty(item.key, item.name, item.k, item.field, item.label);
      const value = firstNonEmpty(item.value, item.val, item.v, item.text, item.content);
      if (key === undefined) continue;
      out[String(key).trim()] = unwrapListWrapper(value);
    }
    return out;
  }

  function parseToolboxKeyValuesRaw(raw) {
    if (raw === undefined || raw === null) return {};

    if (typeof raw === "object") {
      const qData = getContainerValue(getContainerValue(raw, "query"), "data");
      if (Array.isArray(qData)) {
        if (qData.length > 0 && typeof qData[0] === "object") return normalizeMapFromEntries(qData);
        return { __list: qData };
      }
      if (Array.isArray(raw)) return normalizeMapFromEntries(raw);
      return raw;
    }

    const text = String(raw).trim();
    if (!text) return {};

    const parsed = safeJsonParse(text);
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed)) return normalizeMapFromEntries(parsed);
      return parsed;
    }

    const out = {};
    const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    for (const line of lines) {
      const idxEq = line.indexOf("=");
      const idxColon = line.indexOf(":");
      const idx = idxEq >= 0 ? idxEq : idxColon;
      if (idx <= 0) continue;
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) out[k] = v;
    }
    return out;
  }

  function listFromAny(value) {
    const unwrapped = unwrapListWrapper(value);
    if (Array.isArray(unwrapped)) return unwrapped;
    if (unwrapped === undefined || unwrapped === null) return [];
    if (typeof unwrapped === "string") {
      const parsed = safeJsonParse(unwrapped);
      if (Array.isArray(parsed)) return parsed;
    }
    return [unwrapped];
  }

  function toolboxKeyValuesObject() {
    const props = typeof properties !== "undefined" ? properties : undefined;
    const candidates = [
      getContainerValue(props, "keyvaluesobj"),
      getContainerValue(props, "keyvalues"),
    ];

    for (const candidate of candidates) {
      const mapped = parseToolboxKeyValuesRaw(candidate);
      if (mapped && typeof mapped === "object") {
        const keys = Object.keys(mapped);
        if (keys.length > 0 && !(keys.length === 1 && keys[0] === "__list")) return mapped;
      }
    }

    const keyList = listFromAny(getContainerValue(props, "keys"));
    const valueList = listFromAny(getContainerValue(props, "data"));
    if (keyList.length > 0 && valueList.length > 0) {
      const out = {};
      const len = Math.min(keyList.length, valueList.length);
      for (let i = 0; i < len; i += 1) {
        const k = String(keyList[i] ?? "").trim();
        if (!k) continue;
        out[k] = valueList[i];
      }
      if (Object.keys(out).length > 0) return out;
    }

    return {};
  }

  function readInputFromDataHeuristic(key, aliases = []) {
    const names = [key, ...aliases].map((x) => String(x).toLowerCase());
    const props = typeof properties !== "undefined" ? properties : undefined;
    const values = listFromAny(getContainerValue(props, "data"));
    if (values.length === 0) return undefined;

    const isEnvName = (v) => ["version-test", "test", "live", "production", "prod", "version-live"].includes(String(v || "").trim().toLowerCase());
    const isDomainLike = (v) => /^https?:\/\//i.test(String(v || "").trim());
    const isTokenLike = (v) => {
      const t = String(v || "").trim();
      return t.length >= 20 && !/[\s{}\[\]"]/.test(t);
    };

    if (names.includes("output4") || names.includes("photopayload") || names.includes("payload")) {
      for (const v of values) {
        if (parseOutput4Payload(v).payload) return v;
      }
    }

    if (names.includes("token") || names.includes("apitoken") || names.includes("api_token")) {
      for (const v of values) if (isTokenLike(v)) return String(v).trim();
    }

    if (names.includes("env") || names.includes("environment")) {
      for (const v of values) if (isEnvName(v)) return String(v).trim();
    }

    if (names.includes("domain") || names.includes("app_domain")) {
      for (const v of values) if (isDomainLike(v)) return String(v).trim();
    }

    if (names.includes("customfieldmapjson") || names.includes("createdphotomapjson")) {
      for (const v of values) {
        const parsed = safeJsonParse(String(v));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !Array.isArray(parsed.items)) return v;
      }
    }

    return undefined;
  }

  function readInput(key, aliases = []) {
    const names = [key, ...aliases];
    const kvObj = toolboxKeyValuesObject();

    for (const name of names) {
      const value = firstNonEmpty(
        getContainerValue(kvObj, name),
        getContainerValue(typeof data !== "undefined" ? data : undefined, name),
        getContainerValue(typeof properties !== "undefined" ? properties : undefined, name),
        getContainerValue(typeof context !== "undefined" ? context : undefined, name),
        getContainerValue(typeof globalThis !== "undefined" ? globalThis : undefined, name),
      );
      if (value !== undefined) return unwrapListWrapper(value);
    }

    const heuristic = readInputFromDataHeuristic(key, aliases);
    if (heuristic !== undefined) return unwrapListWrapper(heuristic);

    if (names.includes("token") && typeof token !== "undefined") return token;
    if (names.includes("output4") && typeof output4 !== "undefined") return output4;
    if ((names.includes("output4") || names.includes("photopayload")) && typeof photopayload !== "undefined") return photopayload;
    if (names.includes("customFieldMapJson") && typeof customFieldMapJson !== "undefined") return customFieldMapJson;
    if (names.includes("createdPhotoMapJson") && typeof createdPhotoMapJson !== "undefined") return createdPhotoMapJson;
    if (names.includes("env") && typeof env !== "undefined") return env;
    if (names.includes("domain") && typeof domain !== "undefined") return domain;
    if (names.includes("sirket") && typeof sirket !== "undefined") return sirket;

    return undefined;
  }

  function parseOutput4Payload(raw) {
    if (raw === undefined || raw === null) return { payload: null, reason: "empty" };

    if (typeof raw === "object" && !Array.isArray(raw)) {
      if (Array.isArray(raw.items)) return { payload: raw, reason: "object.items" };
      if (raw.value !== undefined) return parseOutput4Payload(raw.value);
      if (raw.payload !== undefined) return parseOutput4Payload(raw.payload);
      if (raw.photopayload !== undefined) return parseOutput4Payload(raw.photopayload);
      if (raw.output4 !== undefined) return parseOutput4Payload(raw.output4);
      const q = raw.query;
      if (q && Array.isArray(q.data) && q.data.length > 0) return parseOutput4Payload(q.data[0]);
      return { payload: null, reason: "object-unrecognized" };
    }

    if (Array.isArray(raw)) {
      for (const item of raw) {
        const parsed = parseOutput4Payload(item);
        if (parsed.payload) return parsed;
      }
      return { payload: null, reason: "array-empty" };
    }

    const text = String(raw).trim();
    if (!text) return { payload: null, reason: "blank-string" };

    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        if (Array.isArray(parsed.items)) return { payload: parsed, reason: "json-string" };
        return parseOutput4Payload(parsed);
      }
      return { payload: null, reason: "json-not-object" };
    } catch (error) {
      return { payload: null, reason: `json-parse-failed:${error?.message || error}` };
    }
  }

  function uniqueStrings(list) {
    const output = [];
    const seen = new Set();
    for (const item of list || []) {
      if (!item) continue;
      const value = String(item).trim();
      if (!value) continue;
      if (!seen.has(value)) {
        seen.add(value);
        output.push(value);
      }
    }
    return output;
  }

  function stripDataUrlPrefix(base64) {
    if (!base64) return "";
    const value = String(base64);
    const marker = "base64,";
    const idx = value.indexOf(marker);
    return idx >= 0 ? value.slice(idx + marker.length) : value;
  }

  function normalizeBubbleUrl(u) {
    const s = String(u || "").trim().replace(/^"+|"+$/g, "");
    if (!s) return "";
    if (s.startsWith("//")) return `https:${s}`;
    return s;
  }

  function normalizeFieldName(name) {
    const n = String(name || "").trim();
    if (!n) return n;
    const low = n.toLowerCase();
    if (low === "urls") return "Urls";
    if (low === "customfield") return "CustomField";
    if (low === "size") return "Size";
    return n;
  }

  function toObject(value, label) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      const parsed = JSON.parse(String(value));
      if (parsed && typeof parsed === "object") return parsed;
      pushError(`${label} object değil`, String(value).slice(0, 200));
      return {};
    } catch (error) {
      pushError(`${label} parse edilemedi`, error?.message || String(error));
      return {};
    }
  }

  function computeFinalUrls({ keptUrls, removedUrls, uploadedUrls }) {
    const kept = uniqueStrings(keptUrls || []);
    const removed = new Set(uniqueStrings(removedUrls || []));
    const cleanedKept = kept.filter((url) => !removed.has(url));
    return uniqueStrings([...cleanedKept, ...(uploadedUrls || [])]);
  }

  function buildOutputLog({ summary, config }) {
    const lines = [];
    lines.push("=== SUMMARY ===");
    lines.push(`elapsedMs=${summary.elapsedMs}`);
    lines.push(`itemsCount=${summary.itemsCount}`);
    lines.push(`uploadedCount=${summary.uploadedCount}`);
    lines.push(`createdCount=${summary.createdCount}`);
    lines.push(`updatedCount=${summary.updatedCount}`);
    lines.push(`errorCount=${summary.errorCount}`);
    lines.push("");
    lines.push("=== CONFIG ===");
    lines.push(`env=${config.env}`);
    lines.push(`domain=${config.domain}`);
    lines.push(`baseUrl=${config.baseUrl}`);
    lines.push(`fileuploadUrl=${config.fileuploadUrl}`);
    lines.push(`photoType=${config.photoType}`);
    lines.push(`fieldCustomFieldRaw=${config.fieldCustomFieldRaw} fieldCustomFieldFinal=${config.fieldCustomFieldFinal}`);
    lines.push(`fieldUrlsRaw=${config.fieldUrlsRaw} fieldUrlsFinal=${config.fieldUrlsFinal}`);
    lines.push(`fieldSizeRaw=${config.fieldSizeRaw} fieldSizeFinal=${config.fieldSizeFinal}`);
    lines.push(`sirketMasked=${config.sirketMasked}`);
    lines.push("");
    lines.push("=== ITEM TRACE ===");
    lines.push(...logs);
    lines.push("");
    lines.push("=== ERRORS ===");
    lines.push(...(errors.length ? errors : ["<none>"]));

    const all = lines.join("\n");
    const MAX_CHARS = 16000;
    if (all.length <= MAX_CHARS) return all;

    const errorBlock = ["=== ERRORS ===", ...(errors.length ? errors : ["<none>"])].join("\n");
    const errorKeep = errorBlock.slice(-5000);
    const prefix = `=== SUMMARY ===\n${summary.elapsedMs ? `elapsedMs=${summary.elapsedMs}` : ""}\n[truncated logs]\n`;
    const room = Math.max(1000, MAX_CHARS - prefix.length - errorKeep.length - 2);
    const keptTrace = logs.join("\n").slice(-room);
    return `${prefix}${keptTrace}\n\n${errorKeep}`;
  }

  let itemsCount = 0;
  let configSnapshot = {
    env: "",
    domain: "",
    baseUrl: "",
    fileuploadUrl: "",
    photoType: "",
    fieldCustomFieldRaw: "",
    fieldCustomFieldFinal: "",
    fieldUrlsRaw: "",
    fieldUrlsFinal: "",
    fieldSizeRaw: "",
    fieldSizeFinal: "",
    sirketMasked: "",
  };

  function buildReturn() {
    const summary = {
      elapsedMs: Date.now() - startedAt,
      itemsCount,
      uploadedCount: uploadedUrlsAll.length,
      createdCount: createdPhotoIds.length,
      updatedCount: updatedPhotoIds.length,
      errorCount: errors.length,
    };

    return {
      output1: buildOutputLog({ summary, config: configSnapshot }),
      outputlist1: createdPhotoIds,
    };
  }

  try {
    const envInputRaw = String(readInput("env", ["environment", "app_env"]) || "version-test").trim().toLowerCase();
    const envInput = envInputRaw.replace(/^version-/, "");
    const ENVIRONMENT = envInput === "live" || envInput === "production" || envInput === "prod" ? "live" : "version-test";
    const APP_DOMAIN = String(readInput("domain", ["app_domain", "base_domain"]) || "https://gaiasphere.io").trim().replace(/\/+$/, "");
    const BUBBLE_API_TOKEN = String(readInput("token", ["apiToken", "api_token", "bubbleToken", "bubble_api_token", "BUBBLE_API_TOKEN"]) || "").trim();
    const SIRKET_ID = String(readInput("sirket", ["company", "companyId", "sirketId"]) || "").trim();

    const PHOTO_TYPE = String(readInput("photoType", ["photo_type"]) || "Photos").trim();
    const PHOTO_FIELD_CUSTOMFIELD_RAW = String(readInput("photoFieldCustomField", ["photo_field_customfield"]) || "CustomField").trim();
    const PHOTO_FIELD_URLS_RAW = String(readInput("photoFieldUrls", ["photo_field_urls"]) || "Urls").trim();
    const PHOTO_FIELD_SIZE_RAW = String(readInput("photoFieldSize", ["photo_field_size"]) || "Size").trim();

    const PHOTO_FIELD_CUSTOMFIELD = normalizeFieldName(PHOTO_FIELD_CUSTOMFIELD_RAW);
    const PHOTO_FIELD_URLS = normalizeFieldName(PHOTO_FIELD_URLS_RAW);
    const PHOTO_FIELD_SIZE = normalizeFieldName(PHOTO_FIELD_SIZE_RAW);

    const BUBBLE_BASE_URL = ENVIRONMENT === "version-test" ? `${APP_DOMAIN}/version-test/api/1.1` : `${APP_DOMAIN}/api/1.1`;
    const BUBBLE_FILEUPLOAD_URL = ENVIRONMENT === "version-test" ? `${APP_DOMAIN}/version-test/fileupload` : `${APP_DOMAIN}/fileupload`;

    configSnapshot = {
      env: ENVIRONMENT,
      domain: APP_DOMAIN,
      baseUrl: BUBBLE_BASE_URL,
      fileuploadUrl: BUBBLE_FILEUPLOAD_URL,
      photoType: PHOTO_TYPE,
      fieldCustomFieldRaw: PHOTO_FIELD_CUSTOMFIELD_RAW,
      fieldCustomFieldFinal: PHOTO_FIELD_CUSTOMFIELD,
      fieldUrlsRaw: PHOTO_FIELD_URLS_RAW,
      fieldUrlsFinal: PHOTO_FIELD_URLS,
      fieldSizeRaw: PHOTO_FIELD_SIZE_RAW,
      fieldSizeFinal: PHOTO_FIELD_SIZE,
      sirketMasked: maskValue(SIRKET_ID),
    };

    pushLog(`[config] envRaw=${envInputRaw} envFinal=${ENVIRONMENT}`);
    pushLog(`[config] domain=${APP_DOMAIN}`);
    pushLog(`[config] token=${maskValue(BUBBLE_API_TOKEN)}`);
    pushLog(`[config] sirket=${maskValue(SIRKET_ID)}`);
    pushLog(`[config] base=${BUBBLE_BASE_URL}`);
    pushLog(`[config] fileupload=${BUBBLE_FILEUPLOAD_URL}`);
    pushLog(`[config] photoType=${PHOTO_TYPE}`);
    pushLog(`[config] fields raw={${PHOTO_FIELD_CUSTOMFIELD_RAW},${PHOTO_FIELD_URLS_RAW},${PHOTO_FIELD_SIZE_RAW}} final={${PHOTO_FIELD_CUSTOMFIELD},${PHOTO_FIELD_URLS},${PHOTO_FIELD_SIZE}}`);

    if (!BUBBLE_API_TOKEN) {
      pushError("token boş", "Bubble API token zorunlu");
      return buildReturn();
    }

    const CUSTOM_FIELD_MAP = toObject(readInput("customFieldMapJson", ["customFieldMap", "custom_field_map_json"]), "customFieldMapJson");
    const CREATED_PHOTO_MAP = toObject(readInput("createdPhotoMapJson", ["createdPhotoMap", "created_photo_map_json"]), "createdPhotoMapJson");

    async function bubbleFetch(path, options = {}) {
      const url = `${BUBBLE_BASE_URL}${path}`;
      const headers = { Authorization: `Bearer ${BUBBLE_API_TOKEN}`, ...(options.headers || {}) };
      const t0 = Date.now();
      const response = await fetch(url, { ...options, headers });
      const text = await response.text();
      const dt = Date.now() - t0;
      pushLog(`[http] ${options.method || "GET"} ${url} status=${response.status} durationMs=${dt} bodyLen=${text.length}`);

      let parsed = text;
      try { parsed = JSON.parse(text); } catch {}

      if (!response.ok) throw new Error(`Bubble API ${response.status} ${response.statusText} ${url} :: ${text.slice(0, 500)}`);
      return { data: parsed, status: response.status, text };
    }

    async function uploadBase64ToBubbleFileupload({ base64, filename, contentType, itemIndex, fileIndex }) {
      pushLog(`[item ${itemIndex}] file ${fileIndex} filename=${filename || "upload.bin"} contentType=${contentType || "application/octet-stream"}`);
      pushLog(`[item ${itemIndex}] file ${fileIndex} base64Len=${String(base64 || "").length}`);

      const cleanB64 = stripDataUrlPrefix(base64);
      pushLog(`[item ${itemIndex}] file ${fileIndex} bytesCandidateLen=${cleanB64.length}`);
      if (!cleanB64) {
        pushLog(`[item ${itemIndex}] file ${fileIndex} base64 boş -> skip`);
        return "";
      }

      let bytesLen = 0;
      try {
        bytesLen = Buffer.from(cleanB64, "base64").length;
      } catch {
        bytesLen = 0;
      }
      pushLog(`[item ${itemIndex}] file ${fileIndex} bytesLen=${bytesLen}`);

      const params = new URLSearchParams({
        api_token: BUBBLE_API_TOKEN,
        private: "true",
        attach_to: SIRKET_ID,
      });
      const uploadUrl = `${BUBBLE_FILEUPLOAD_URL}?${params.toString()}`;
      const maskedUploadUrl = `${BUBBLE_FILEUPLOAD_URL}?api_token=${maskValue(BUBBLE_API_TOKEN)}&private=true&attach_to=${maskValue(SIRKET_ID)}`;

      pushLog(`[item ${itemIndex}] file ${fileIndex} upload-request url=${maskedUploadUrl} private=true attach_to=${maskValue(SIRKET_ID)}`);

      const bodyPayload = {
        name: filename || "upload.bin",
        contents: cleanB64,
      };

      const t0 = Date.now();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/plain",
        },
        body: JSON.stringify(bodyPayload),
      });
      const text = await response.text();
      const dt = Date.now() - t0;

      pushLog(`[item ${itemIndex}] file ${fileIndex} upload-response status=${response.status} durationMs=${dt} bodyFirst=${text.slice(0, 300)}`);

      if (!response.ok) {
        pushError(`[item ${itemIndex}] file ${fileIndex} upload http fail`, `${response.status} ${response.statusText}`);
        return "";
      }

      let candidate = text;
      const parsed = safeJsonParse(text);
      if (parsed && typeof parsed === "object") {
        candidate = parsed.url || parsed.file_url || parsed.fileUrl || parsed.response?.url || text;
      }

      const normalized = normalizeBubbleUrl(candidate);
      pushLog(`[item ${itemIndex}] file ${fileIndex} normalizedUrl=${normalized.slice(0, 200)}`);

      if (!/^https?:\/\//i.test(normalized)) {
        pushError(`[item ${itemIndex}] file ${fileIndex} unexpected upload response`, normalized.slice(0, 300));
        return "";
      }

      return normalized;
    }

    function buildPhotoPayload(customFieldId, urls, sizeNumber) {
      const urlList = Array.isArray(urls) ? urls : (urls ? [String(urls)] : []);
      return {
        [PHOTO_FIELD_CUSTOMFIELD]: customFieldId,
        [PHOTO_FIELD_URLS]: urlList,
        [PHOTO_FIELD_SIZE]: Number(sizeNumber) || urlList.length,
      };
    }

    async function createPhoto(body, itemIndex) {
      const res = await bubbleFetch(`/obj/${PHOTO_TYPE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      pushLog(`[item ${itemIndex}] create status=${res.status}`);
      return res.data?.id || res.data?.response?.id || res.data?.response?.result?.id || null;
    }

    async function updatePhoto(photoId, body, itemIndex) {
      const res = await bubbleFetch(`/obj/${PHOTO_TYPE}/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      pushLog(`[item ${itemIndex}] update status=${res.status}`);
      return res.data?.id || res.data?.response?.id || res.data?.response?.result?.id || photoId;
    }

    async function getPhoto(photoId, itemIndex) {
      const res = await bubbleFetch(`/obj/${PHOTO_TYPE}/${photoId}`, { method: "GET" });
      pushLog(`[item ${itemIndex}] verify-get status=${res.status}`);
      return res.data;
    }

    const output4Raw = readInput("output4", ["photopayload", "photoPayload", "payload", "output"]);
    const output4Parsed = parseOutput4Payload(output4Raw);
    if (!output4Parsed.payload) {
      pushError("output4 yok/boş", `geçerli payload bulunamadı (${output4Parsed.reason}) | rawType=${typeof output4Raw} | first200=${String(output4Raw || "").slice(0, 200)}`);
      return buildReturn();
    }

    const payload = output4Parsed.payload;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    itemsCount = items.length;
    pushLog(`[input] output4 parse mode=${output4Parsed.reason}`);
    pushLog(`[input] items=${items.length}`);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const customFieldName = String(item?.customFieldName || "").trim();
      pushLog(`[item ${i}] customFieldName=${customFieldName}`);

      if (!customFieldName) {
        pushError(`[item ${i}] customFieldName boş`, "item atlandı");
        continue;
      }

      const customFieldId = CUSTOM_FIELD_MAP[customFieldName];
      pushLog(`[item ${i}] customFieldId=${customFieldId || "<missing>"}`);
      if (!customFieldId) {
        pushError(`[item ${i}] customField map bulunamadı`, `customFieldName=${customFieldName}`);
        continue;
      }

      const newFiles = Array.isArray(item?.newFiles) ? item.newFiles : [];
      const keptUrls = Array.isArray(item?.keptUrls) ? item.keptUrls : [];
      const removedUrls = Array.isArray(item?.removedUrls) ? item.removedUrls : [];
      pushLog(`[item ${i}] kept=${keptUrls.length} removed=${removedUrls.length} newFiles=${newFiles.length}`);

      if (newFiles.length > 0 && !SIRKET_ID) {
        pushError(`[item ${i}] sirket boş`, "newFiles var ama attach_to için sirket zorunlu; item atlandı");
        continue;
      }

      const uploadedUrls = [];
      for (let fileIdx = 0; fileIdx < newFiles.length; fileIdx += 1) {
        const file = newFiles[fileIdx] || {};
        const url = await uploadBase64ToBubbleFileupload({
          base64: file.base64,
          filename: file.filename,
          contentType: file.contentType,
          itemIndex: i,
          fileIndex: fileIdx,
        });
        if (url) {
          uploadedUrls.push(url);
          uploadedUrlsAll.push(url);
        }
      }

      const finalUrls = computeFinalUrls({ keptUrls, removedUrls, uploadedUrls });
      const sizeNumber = finalUrls.length;
      pushLog(`[item ${i}] finalUrlsCount=${finalUrls.length} sample=${finalUrls.slice(0, 2).join(" | ")}`);

      const body = buildPhotoPayload(customFieldId, finalUrls, sizeNumber);
      const itemPhotoId = String(item?.photoId || "").trim();
      const mappedPhotoId = String(CREATED_PHOTO_MAP[customFieldName] || "").trim();
      const targetPhotoId = itemPhotoId || mappedPhotoId;

      try {
        if (targetPhotoId) {
          const updatedPhotoId = await updatePhoto(targetPhotoId, body, i);
          if (!updatedPhotoId) {
            pushError(`[item ${i}] update başarılı ama id dönmedi`, `target=${targetPhotoId}`);
            continue;
          }
          updatedPhotoIds.push(updatedPhotoId);
          pushLog(`[item ${i}] updatedPhotoId=${updatedPhotoId}`);
          const check = await getPhoto(updatedPhotoId, i);
          const urlsValue = check?.response?.[PHOTO_FIELD_URLS] ?? check?.[PHOTO_FIELD_URLS];
          pushLog(`[item ${i}] verify Urls=${JSON.stringify(urlsValue).slice(0, 300)}`);
          const expected = JSON.stringify(finalUrls);
          const actual = JSON.stringify(Array.isArray(urlsValue) ? urlsValue : []);
          if (expected !== actual) pushError(`[item ${i}] write verification failed`, `expected=${expected.slice(0, 300)} actual=${actual.slice(0, 300)}`);
        } else {
          const newPhotoId = await createPhoto(body, i);
          if (!newPhotoId) {
            pushError(`[item ${i}] create başarılı ama id dönmedi`, JSON.stringify(body).slice(0, 300));
            continue;
          }
          createdPhotoIds.push(newPhotoId);
          pushLog(`[item ${i}] createdPhotoId=${newPhotoId}`);
          const check = await getPhoto(newPhotoId, i);
          const urlsValue = check?.response?.[PHOTO_FIELD_URLS] ?? check?.[PHOTO_FIELD_URLS];
          pushLog(`[item ${i}] verify Urls=${JSON.stringify(urlsValue).slice(0, 300)}`);
          const expected = JSON.stringify(finalUrls);
          const actual = JSON.stringify(Array.isArray(urlsValue) ? urlsValue : []);
          if (expected !== actual) pushError(`[item ${i}] write verification failed`, `expected=${expected.slice(0, 300)} actual=${actual.slice(0, 300)}`);
        }
      } catch (error) {
        pushError(`[item ${i}] photo create/update hatası`, error?.message || String(error));
      }
    }

    pushLog(`[done] created=${createdPhotoIds.length} updated=${updatedPhotoIds.length} uploaded=${uploadedUrlsAll.length} errors=${errors.length}`);
    return buildReturn();
  } catch (error) {
    pushError("fatal", `${error?.message || error}`);
    pushLog(`[stack] ${(error?.stack || "").slice(0, 1000)}`);
    return buildReturn();
  }
})();
