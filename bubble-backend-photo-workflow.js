(async () => {
  const startedAt = Date.now();
  const logs = [];
  const errors = [];
  const createdPhotoIds = [];
  const updatedPhotoIds = [];
  const uploadedUrlsAll = [];

  function pushLog(message) {
    logs.push(message);
  }

  function pushError(message, extra) {
    const line = extra ? `${message} :: ${extra}` : message;
    errors.push(line);
    logs.push(`[error] ${line}`);
  }

  function safeMaskToken(token) {
    if (!token) return "<empty>";
    if (token.length <= 8) return `${token.slice(0, 2)}***`;
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
  }

  function uniqueStrings(list) {
    const output = [];
    const seen = new Set();
    for (const item of list || []) {
      if (!item) continue;
      const value = String(item);
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

  function computeFinalUrls({ keptUrls, removedUrls, uploadedUrls }) {
    const kept = uniqueStrings(keptUrls || []);
    const removed = new Set(uniqueStrings(removedUrls || []));
    const cleanedKept = kept.filter((url) => !removed.has(url));
    return uniqueStrings([...cleanedKept, ...(uploadedUrls || [])]);
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

  function getContainerValue(container, key) {
    if (!container || typeof container !== "object") return undefined;
    if (container[key] !== undefined && container[key] !== null) return unwrapListWrapper(container[key]);

    const target = String(key).trim().toLowerCase();
    const keys = Object.keys(container);
    const foundKey = keys.find((k) => String(k).trim().toLowerCase() === target);
    if (foundKey) return unwrapListWrapper(container[foundKey]);

    return undefined;
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && !value.trim()) continue;
      return value;
    }
    return undefined;
  }

  function safeJsonParse(value) {
    if (typeof value !== "string") return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  function unwrapListWrapper(value) {
    if (value === undefined || value === null) return value;

    if (typeof value === "object") {
      const q = getContainerValue(value, "query");
      const qData = getContainerValue(q, "data");
      if (Array.isArray(qData)) {
        if (qData.length === 1) return qData[0];
        return qData;
      }
      return value;
    }

    if (typeof value === "string") {
      const parsed = safeJsonParse(value);
      if (parsed && typeof parsed === "object") {
        const q = getContainerValue(parsed, "query");
        const qData = getContainerValue(q, "data");
        if (Array.isArray(qData)) {
          if (qData.length === 1) return qData[0];
          return qData;
        }
      }
    }

    return value;
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
      // Bubble ListWrapper support: { _class: "ListWrapper", query: { data: [...] } }
      const wrapperData = getContainerValue(getContainerValue(raw, "query"), "data");
      if (Array.isArray(wrapperData)) {
        if (wrapperData.length > 0 && typeof wrapperData[0] === "object") return normalizeMapFromEntries(wrapperData);
        return { __list: wrapperData };
      }

      if (Array.isArray(raw)) return normalizeMapFromEntries(raw);
      return raw;
    }

    const text = String(raw).trim();
    if (!text) return {};

    // 1) JSON object / array
    const parsed = safeJsonParse(text);
    if (parsed && typeof parsed === "object") {
      if (Array.isArray(parsed)) return normalizeMapFromEntries(parsed);
      return parsed;
    }

    // 2) newline format: key=value or key: value
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

  function toolboxKeyValuesObject() {
    function asList(value) {
      if (value === undefined || value === null) return [];
      if (Array.isArray(value)) return value;
      if (typeof value === "object") {
        const q = getContainerValue(value, "query");
        const qData = getContainerValue(q, "data");
        if (Array.isArray(qData)) return qData;
      }

      const text = String(value || "").trim();
      if (!text) return [];
      const parsed = safeJsonParse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") {
        const q2 = getContainerValue(parsed, "query");
        const qData2 = getContainerValue(q2, "data");
        if (Array.isArray(qData2)) return qData2;
      }

      return text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    }

    const props = typeof properties !== "undefined" ? properties : undefined;

    // 1) Direct key-values object from Toolbox
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

    // 2) Toolbox often sends keys and data as two list wrappers; zip them.
    const keyList = asList(getContainerValue(props, "keys"));
    const valueList = asList(getContainerValue(props, "data"));
    if (keyList.length > 0 && valueList.length > 0) {
      const out = {};
      const length = Math.min(keyList.length, valueList.length);
      for (let i = 0; i < length; i += 1) {
        const k = String(keyList[i] ?? "").trim();
        if (!k) continue;
        out[k] = valueList[i];
      }
      if (Object.keys(out).length > 0) return out;
    }

    return {};
  }

  function readInputFromToolboxDataHeuristic(key, aliases = []) {
    const names = [key, ...aliases].map((x) => String(x).toLowerCase());
    const props = typeof properties !== "undefined" ? properties : undefined;

    function listFrom(v) {
      const u = unwrapListWrapper(v);
      if (Array.isArray(u)) return u;
      if (u === undefined || u === null) return [];
      return [u];
    }

    const rawData = getContainerValue(props, "data");
    const values = listFrom(rawData);
    if (values.length === 0) return undefined;

    const isEnvName = (v) => ["version-test", "test", "live", "production", "prod", "version-live"].includes(String(v || "").trim().toLowerCase());
    const isDomainLike = (v) => /^https?:\/\//i.test(String(v || "").trim());
    const parseableOutput = (v) => parseOutput4Payload(v).payload;
    const isTokenLike = (v) => {
      const t = String(v || "").trim();
      return t.length >= 20 && !/[\s{}\[\]"]/.test(t);
    };

    if (names.includes("output4") || names.includes("photopayload") || names.includes("payload")) {
      for (const v of values) if (parseableOutput(v)) return v;
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
      if (value !== undefined) return value;
    }

    const toolboxHeuristic = readInputFromToolboxDataHeuristic(key, aliases);
    if (toolboxHeuristic !== undefined) return toolboxHeuristic;

    // direct globals fallback
    if (names.includes("token") && typeof token !== "undefined") return token;
    if (names.includes("output4") && typeof output4 !== "undefined") return output4;
    if ((names.includes("output4") || names.includes("photopayload")) && typeof photopayload !== "undefined") return photopayload;
    if (names.includes("customFieldMapJson") && typeof customFieldMapJson !== "undefined") return customFieldMapJson;
    if (names.includes("createdPhotoMapJson") && typeof createdPhotoMapJson !== "undefined") return createdPhotoMapJson;
    if (names.includes("env") && typeof env !== "undefined") return env;
    if (names.includes("domain") && typeof domain !== "undefined") return domain;

    return undefined;
  }

  function parseOutput4Payload(raw) {
    if (raw === undefined || raw === null) return { payload: null, reason: "empty" };

    // direct object payload: {version, items}
    if (typeof raw === "object" && !Array.isArray(raw)) {
      if (Array.isArray(raw.items)) return { payload: raw, reason: "object.items" };

      // value container formats
      if (raw.value !== undefined) return parseOutput4Payload(raw.value);
      if (raw.payload !== undefined) return parseOutput4Payload(raw.payload);
      if (raw.photopayload !== undefined) return parseOutput4Payload(raw.photopayload);
      if (raw.output4 !== undefined) return parseOutput4Payload(raw.output4);

      // Bubble list wrapper-like structure
      const q = raw.query;
      if (q && Array.isArray(q.data) && q.data.length > 0) {
        return parseOutput4Payload(q.data[0]);
      }

      return { payload: null, reason: "object-unrecognized" };
    }

    // arrays: try first non-empty
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

  function debugScopesSnapshot() {
    function preview(obj) {
      if (!obj || typeof obj !== "object") return [];
      return Object.keys(obj).slice(0, 25);
    }

    const kvObj = toolboxKeyValuesObject();
    return {
      dataKeys: preview(typeof data !== "undefined" ? data : undefined),
      propertiesKeys: preview(typeof properties !== "undefined" ? properties : undefined),
      contextKeys: preview(typeof context !== "undefined" ? context : undefined),
      globalKeys: preview(typeof globalThis !== "undefined" ? globalThis : undefined),
      keyvaluesKeys: preview(kvObj),
    };
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
    if (n.toLowerCase() === "urls") return "Urls";
    if (n.toLowerCase() === "customfield") return "CustomField";
    if (n.toLowerCase() === "size") return "Size";
    return n;
  }

  function buildReturn(extra = {}) {
    const photoIds = uniqueStrings([...updatedPhotoIds, ...createdPhotoIds]);
    const elapsedMs = Date.now() - startedAt;
    const hasError = errors.length > 0;
    const summary = {
      createdCount: createdPhotoIds.length,
      updatedCount: updatedPhotoIds.length,
      totalPhotoCount: photoIds.length,
      uploadedUrlCount: uploadedUrlsAll.length,
      errorCount: errors.length,
      elapsedMs,
      hasError,
      ...extra,
    };

    const errorText = errors.length ? errors.join("\n") : "";

    return {
      output1: errorText,
      outputlist1: createdPhotoIds,
    };
  }

  try {
    const envInputRaw = String(readInput("env", ["environment", "app_env"]) || "version-test").trim().toLowerCase();
    const envInput = envInputRaw.replace(/^version-/, "");
    const ENVIRONMENT = envInput === "live" || envInput === "production" || envInput === "prod" ? "live" : "version-test";
    const APP_DOMAIN = String(readInput("domain", ["app_domain", "base_domain"]) || "https://gaiasphere.io").trim().replace(/\/+$/, "");
    const BUBBLE_API_TOKEN = String(readInput("token", ["apiToken", "api_token", "bubbleToken", "bubble_api_token", "BUBBLE_API_TOKEN"]) || "").trim();

    const PHOTO_TYPE = String(readInput("photoType", ["photo_type"]) || "Photos").trim();
    const PHOTO_FIELD_CUSTOMFIELD = normalizeFieldName(readInput("photoFieldCustomField", ["photo_field_customfield"]) || "CustomField");
    const PHOTO_FIELD_URLS = normalizeFieldName(readInput("photoFieldUrls", ["photo_field_urls"]) || "Urls");
    const PHOTO_FIELD_SIZE = normalizeFieldName(readInput("photoFieldSize", ["photo_field_size"]) || "Size");

    const BUBBLE_BASE_URL = ENVIRONMENT === "version-test" ? `${APP_DOMAIN}/version-test/api/1.1` : `${APP_DOMAIN}/api/1.1`;
    const BUBBLE_FILEUPLOAD_URL = ENVIRONMENT === "version-test" ? `${APP_DOMAIN}/version-test/fileupload` : `${APP_DOMAIN}/fileupload`;

    pushLog(`[config] envRaw=${envInputRaw} envFinal=${ENVIRONMENT}`);
    pushLog(`[config] domain=${APP_DOMAIN}`);
    pushLog(`[config] token=${safeMaskToken(BUBBLE_API_TOKEN)}`);
    pushLog(`[config] base=${BUBBLE_BASE_URL}`);
    pushLog(`[config] fileupload=${BUBBLE_FILEUPLOAD_URL}`);
    pushLog(`[config] photoType=${PHOTO_TYPE} fields={${PHOTO_FIELD_CUSTOMFIELD}, ${PHOTO_FIELD_URLS}, ${PHOTO_FIELD_SIZE}}`);

    if (!BUBBLE_API_TOKEN) {
      const snap = debugScopesSnapshot();
      pushError("token boş", `token bulunamadı. keyvaluesKeys=${snap.keyvaluesKeys.join(",")} | dataKeys=${snap.dataKeys.join(",")} | propertiesKeys=${snap.propertiesKeys.join(",")} | contextKeys=${snap.contextKeys.join(",")}`);
      return buildReturn({ stoppedAt: "config.token" });
    }

    const CUSTOM_FIELD_MAP = toObject(readInput("customFieldMapJson", ["customFieldMap", "custom_field_map_json"]), "customFieldMapJson");
    const CREATED_PHOTO_MAP = toObject(readInput("createdPhotoMapJson", ["createdPhotoMap", "created_photo_map_json"]), "createdPhotoMapJson");
    pushLog(`[config] customFieldMap keys=${Object.keys(CUSTOM_FIELD_MAP).length}`);
    pushLog(`[config] createdPhotoMap keys=${Object.keys(CREATED_PHOTO_MAP).length}`);

    async function bubbleFetch(path, options = {}) {
      const url = `${BUBBLE_BASE_URL}${path}`;
      const headers = { Authorization: `Bearer ${BUBBLE_API_TOKEN}`, ...(options.headers || {}) };

      pushLog(`[http] ${options.method || "GET"} ${url}`);
      const response = await fetch(url, { ...options, headers });
      const text = await response.text();
      pushLog(`[http] ${response.status} ${response.statusText} ${url} bodyLen=${text.length}`);

      let parsed = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // text response
      }

      if (!response.ok) {
        throw new Error(`Bubble API ${response.status} ${response.statusText} ${url} :: ${text.slice(0, 500)}`);
      }
      return parsed;
    }

    async function uploadBase64ToBubbleFileupload({ base64, filename, contentType, itemIndex, fileIndex }) {
      pushLog(`[item ${itemIndex}] file ${fileIndex} base64Head=${String(base64 || "").slice(0, 80)}`);
      const cleanB64 = stripDataUrlPrefix(base64);
      pushLog(`[item ${itemIndex}] file ${fileIndex} cleanB64Len=${String(cleanB64 || "").length}`);
      if (!cleanB64) {
        pushLog(`[item ${itemIndex}] file ${fileIndex} base64 boş -> skip`);
        return "";
      }

      let bytes;
      try {
        bytes = Buffer.from(cleanB64, "base64");
      } catch (error) {
        pushError(`[item ${itemIndex}] file ${fileIndex} base64 decode hata`, error?.message || String(error));
        return "";
      }
      pushLog(`[item ${itemIndex}] file ${fileIndex} byteLen=${bytes.length}`);

      const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
      const form = new FormData();
      form.append("file", blob, filename || "upload.bin");

      pushLog(`[item ${itemIndex}] file ${fileIndex} upload başlıyor filename=${filename || "upload.bin"} type=${contentType || "application/octet-stream"} byteLen=${bytes.length}`);

      const uploadUrl = `${BUBBLE_FILEUPLOAD_URL}?api_token=${encodeURIComponent(BUBBLE_API_TOKEN)}`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: form,
      });

      const text = await response.text();
      pushLog(`[item ${itemIndex}] file ${fileIndex} upload status=${response.status} bodyLen=${text.length}`);
      pushLog(`[item ${itemIndex}] file ${fileIndex} upload bodyFirst=${text.slice(0, 300)}`);

      if (!response.ok) {
        throw new Error(`Fileupload ${response.status} ${response.statusText} :: ${text.slice(0, 500)}`);
      }

      try {
        const body = JSON.parse(text);
        return normalizeBubbleUrl(body.url || body.file_url || body.fileUrl || body.response?.url || text);
      } catch {
        return normalizeBubbleUrl(text);
      }
    }

    function buildPhotoPayload(customFieldId, urls, sizeNumber) {
      const urlList = Array.isArray(urls) ? urls : (urls ? [String(urls)] : []);
      return {
        [PHOTO_FIELD_CUSTOMFIELD]: customFieldId,
        [PHOTO_FIELD_URLS]: urlList,
        [PHOTO_FIELD_SIZE]: Number(sizeNumber) || urlList.length,
      };
    }

    async function createPhoto(body) {
      const response = await bubbleFetch(`/obj/${PHOTO_TYPE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response?.id || response?.response?.id || response?.response?.result?.id || null;
    }

    async function updatePhoto(photoId, body) {
      const response = await bubbleFetch(`/obj/${PHOTO_TYPE}/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return response?.id || response?.response?.id || response?.response?.result?.id || photoId;
    }

    async function getPhoto(photoId) {
      return await bubbleFetch(`/obj/${PHOTO_TYPE}/${photoId}`, { method: "GET" });
    }

    const output4Raw = readInput("output4", ["photopayload", "photoPayload", "payload", "output"]);
    const output4Parsed = parseOutput4Payload(output4Raw);
    if (!output4Parsed.payload) {
      pushError("output4 yok/boş", `geçerli payload bulunamadı (${output4Parsed.reason}) | rawType=${typeof output4Raw} | first200=${String(output4Raw || "").slice(0, 200)}`);
      return buildReturn({ stoppedAt: "input.output4" });
    }

    const payload = output4Parsed.payload;
    pushLog(`[input] output4 parse mode=${output4Parsed.reason}`);

    const items = Array.isArray(payload?.items) ? payload.items : [];
    pushLog(`[input] items=${items.length}`);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const customFieldName = (item?.customFieldName || "").trim();
      pushLog(`\n[item ${i}] customFieldName="${customFieldName}"`);

      if (!customFieldName) {
        pushError(`[item ${i}] customFieldName boş`, "item atlandı");
        continue;
      }

      const customFieldId = CUSTOM_FIELD_MAP[customFieldName];
      if (!customFieldId) {
        pushError(`[item ${i}] customField map bulunamadı`, `customFieldName=${customFieldName}`);
        continue;
      }
      pushLog(`[item ${i}] customFieldId=${customFieldId}`);

      const newFiles = Array.isArray(item?.newFiles) ? item.newFiles : [];
      const keptUrls = Array.isArray(item?.keptUrls) ? item.keptUrls : [];
      const removedUrls = Array.isArray(item?.removedUrls) ? item.removedUrls : [];
      pushLog(`[item ${i}] kept=${keptUrls.length} removed=${removedUrls.length} newFiles=${newFiles.length}`);

      const uploadedUrls = [];
      for (let fileIdx = 0; fileIdx < newFiles.length; fileIdx += 1) {
        const file = newFiles[fileIdx] || {};
        try {
          const uploadedUrl = await uploadBase64ToBubbleFileupload({
            base64: file.base64,
            filename: file.filename,
            contentType: file.contentType,
            itemIndex: i,
            fileIndex: fileIdx,
          });
          if (uploadedUrl) {
            uploadedUrls.push(uploadedUrl);
            uploadedUrlsAll.push(uploadedUrl);
            pushLog(`[item ${i}] file ${fileIdx} uploadedUrl=${uploadedUrl}`);
          }
        } catch (error) {
          pushError(`[item ${i}] file ${fileIdx} upload hatası`, error?.message || String(error));
        }
      }

      const finalUrls = computeFinalUrls({ keptUrls, removedUrls, uploadedUrls });
      const sizeNumber = finalUrls.length;
      pushLog(`[item ${i}] finalUrls=${sizeNumber}`);

      const body = buildPhotoPayload(customFieldId, finalUrls, sizeNumber);
      const itemPhotoId = (item?.photoId || "").trim();
      const mappedPhotoId = String(CREATED_PHOTO_MAP[customFieldName] || "").trim();
      const targetPhotoId = itemPhotoId || mappedPhotoId;

      try {
        if (targetPhotoId) {
          const updatedPhotoId = await updatePhoto(targetPhotoId, body);
          if (updatedPhotoId) {
            updatedPhotoIds.push(updatedPhotoId);
            pushLog(`[item ${i}] updatedPhotoId=${updatedPhotoId}`);
            const check = await getPhoto(updatedPhotoId);
            const urlsValue = check?.response?.[PHOTO_FIELD_URLS] ?? check?.[PHOTO_FIELD_URLS];
            pushLog(`[item ${i}] verify Urls=${JSON.stringify(urlsValue).slice(0, 200)}`);
          } else {
            pushError(`[item ${i}] update başarılı ama id dönmedi`, `target=${targetPhotoId}`);
          }
        } else {
          const newPhotoId = await createPhoto(body);
          if (newPhotoId) {
            createdPhotoIds.push(newPhotoId);
            pushLog(`[item ${i}] createdPhotoId=${newPhotoId}`);
            const check = await getPhoto(newPhotoId);
            const urlsValue = check?.response?.[PHOTO_FIELD_URLS] ?? check?.[PHOTO_FIELD_URLS];
            pushLog(`[item ${i}] verify Urls=${JSON.stringify(urlsValue).slice(0, 200)}`);
          } else {
            pushError(`[item ${i}] create başarılı ama id dönmedi`, JSON.stringify(body).slice(0, 300));
          }
        }
      } catch (error) {
        pushError(`[item ${i}] photo create/update hatası`, error?.message || String(error));
      }
    }

    pushLog(`\n[done] created=${createdPhotoIds.length} updated=${updatedPhotoIds.length} uploaded=${uploadedUrlsAll.length} errors=${errors.length} elapsedMs=${Date.now() - startedAt}`);
    return buildReturn();
  } catch (error) {
    pushError("fatal", `${error?.message || error}`);
    pushLog(`[stack] ${error?.stack || ""}`);
    return buildReturn({ stoppedAt: "fatal.catch" });
  }
})();
