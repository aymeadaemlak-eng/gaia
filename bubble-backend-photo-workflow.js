(async () => {
  // =======================================================
  // INPUT (Bubble Toolbox key/value)
  // =======================================================
  // data.output4: text (JSON string) -> { version: 1, items: [...] }
  //
  // Optional key/value:
  // data.env                 : "version-test" | "live"
  // data.domain              : "https://gaiasphere.io"
  // data.token               : Bubble API token
  // data.customFieldMapJson  : text(JSON) -> {"customFieldName":"customFieldId"}
  //
  // Optional override for Photos schema:
  // data.photoType
  // data.photoFieldCustomField
  // data.photoFieldUrls
  // data.photoFieldSize
  // =======================================================

  const createdPhotoIds = [];
  const logs = [];
  const startedAt = Date.now();

  try {
    // -----------------------
    // 0) Config
    // -----------------------
    const ENVIRONMENT = (data?.env || "version-test").trim();
    const APP_DOMAIN = (data?.domain || "https://gaiasphere.io").trim();
    const BUBBLE_API_TOKEN = (data?.token || "").trim();

    const PHOTO_TYPE = (data?.photoType || "Photos").trim();
    const PHOTO_FIELD_CUSTOMFIELD = (data?.photoFieldCustomField || "CustomField").trim();
    const PHOTO_FIELD_URLS = (data?.photoFieldUrls || "Urls").trim();
    const PHOTO_FIELD_SIZE = (data?.photoFieldSize || "Size").trim();

    if (!BUBBLE_API_TOKEN) {
      throw new Error("Bubble API token boş. data.token key/value olarak gönderilmelidir.");
    }

    const BUBBLE_BASE_URL =
      ENVIRONMENT === "version-test"
        ? `${APP_DOMAIN}/version-test/api/1.1`
        : `${APP_DOMAIN}/api/1.1`;

    const BUBBLE_FILEUPLOAD_URL =
      ENVIRONMENT === "version-test"
        ? `${APP_DOMAIN}/version-test/fileupload`
        : `${APP_DOMAIN}/fileupload`;

    logs.push(`[config] env=${ENVIRONMENT}`);
    logs.push(`[config] base=${BUBBLE_BASE_URL}`);
    logs.push(`[config] fileupload=${BUBBLE_FILEUPLOAD_URL}`);
    logs.push(`[config] photoType=${PHOTO_TYPE} fields={${PHOTO_FIELD_CUSTOMFIELD}, ${PHOTO_FIELD_URLS}, ${PHOTO_FIELD_SIZE}}`);

    // customFieldName -> customFieldId map
    let CUSTOM_FIELD_MAP = {};
    if (data?.customFieldMapJson) {
      try {
        CUSTOM_FIELD_MAP = JSON.parse(String(data.customFieldMapJson));
      } catch (error) {
        throw new Error(`customFieldMapJson parse edilemedi: ${error?.message || error}`);
      }
    }
    logs.push(`[config] customFieldMap keys=${Object.keys(CUSTOM_FIELD_MAP).length}`);

    // -----------------------
    // 1) Helpers
    // -----------------------
    async function bubbleFetch(path, options = {}) {
      const url = `${BUBBLE_BASE_URL}${path}`;
      const headers = {
        Authorization: `Bearer ${BUBBLE_API_TOKEN}`,
        ...(options.headers || {}),
      };

      const response = await fetch(url, { ...options, headers });
      const text = await response.text();

      let parsed = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // no-op
      }

      if (!response.ok) {
        throw new Error(`Bubble API ${response.status} ${response.statusText} ${url} :: ${text}`);
      }

      return parsed;
    }

    function stripDataUrlPrefix(base64) {
      if (!base64) return "";
      const value = String(base64);
      const marker = "base64,";
      const idx = value.indexOf(marker);
      return idx >= 0 ? value.slice(idx + marker.length) : value;
    }

    function uniqueStrings(list) {
      const output = [];
      const seen = new Set();

      for (const item of list || []) {
        if (!item) continue;

        const str = String(item);
        if (!seen.has(str)) {
          seen.add(str);
          output.push(str);
        }
      }

      return output;
    }

    function computeFinalUrls({ keptUrls, removedUrls, uploadedUrls }) {
      const kept = uniqueStrings(keptUrls || []);
      const removed = new Set(uniqueStrings(removedUrls || []));
      const cleanedKept = kept.filter((url) => !removed.has(url));
      return uniqueStrings([...cleanedKept, ...(uploadedUrls || [])]);
    }

    async function uploadBase64ToBubbleFileupload({ base64, filename, contentType }) {
      const cleanB64 = stripDataUrlPrefix(base64);
      if (!cleanB64) return "";

      const bytes = Buffer.from(cleanB64, "base64");
      const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });
      const form = new FormData();
      form.append("file", blob, filename || "upload.bin");

      const response = await fetch(BUBBLE_FILEUPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${BUBBLE_API_TOKEN}` },
        body: form,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Fileupload ${response.status} ${response.statusText} :: ${text}`);
      }

      try {
        const body = JSON.parse(text);
        return body.url || body.file_url || body.fileUrl || body.response?.url || text;
      } catch {
        return text.trim().replace(/^"+|"+$/g, "");
      }
    }

    async function createPhoto(customFieldId, urls, sizeNumber) {
      const body = {
        [PHOTO_FIELD_CUSTOMFIELD]: customFieldId,
        [PHOTO_FIELD_URLS]: urls,
        [PHOTO_FIELD_SIZE]: sizeNumber,
      };

      const response = await bubbleFetch(`/obj/${PHOTO_TYPE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      return response?.id || response?.response?.id || response?.response?.result?.id || null;
    }

    // -----------------------
    // 2) Parse output4
    // -----------------------
    if (!data?.output4 || typeof data.output4 !== "string") {
      logs.push("[input] output4 yok/boş");
      return { createdPhotoIds, log: logs.join("\n") };
    }

    let payload;
    try {
      payload = JSON.parse(data.output4);
    } catch {
      throw new Error(`output4 JSON parse edilemedi. İlk 200 char: ${String(data.output4).slice(0, 200)}`);
    }

    const items = Array.isArray(payload?.items) ? payload.items : [];
    logs.push(`[input] items=${items.length}`);

    // -----------------------
    // 3) Main loop
    // -----------------------
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const customFieldName = (item?.customFieldName || "").trim();

      logs.push(`\n[item ${i}] customFieldName=\"${customFieldName}\"`);

      if (!customFieldName) {
        logs.push(`[item ${i}] skip: customFieldName empty`);
        continue;
      }

      const customFieldId = CUSTOM_FIELD_MAP[customFieldName];
      if (!customFieldId) {
        throw new Error(`[item ${i}] CUSTOM_FIELD_MAP missing key: \"${customFieldName}\"`);
      }
      logs.push(`[item ${i}] customFieldId=${customFieldId}`);

      const newFiles = Array.isArray(item?.newFiles) ? item.newFiles : [];
      logs.push(`[item ${i}] newFiles=${newFiles.length}`);

      const uploadedUrls = [];
      for (let fileIdx = 0; fileIdx < newFiles.length; fileIdx += 1) {
        const file = newFiles[fileIdx];

        if (!file?.base64) {
          logs.push(`[item ${i}] file ${fileIdx} skip: base64 empty`);
          continue;
        }

        logs.push(
          `[item ${i}] file ${fileIdx} uploading filename=\"${file.filename || ""}\" type=\"${file.contentType || ""}\" b64len=${String(file.base64).length}`,
        );

        const uploadedUrl = await uploadBase64ToBubbleFileupload({
          base64: file.base64,
          filename: file.filename,
          contentType: file.contentType,
        });

        logs.push(`[item ${i}] file ${fileIdx} uploadedUrl=${uploadedUrl}`);
        if (uploadedUrl) uploadedUrls.push(uploadedUrl);
      }

      const finalUrls = computeFinalUrls({
        keptUrls: item?.keptUrls || [],
        removedUrls: item?.removedUrls || [],
        uploadedUrls,
      });

      const sizeNumber = Array.isArray(finalUrls) ? finalUrls.length : 0;
      logs.push(`[item ${i}] finalUrls=${sizeNumber}`);

      const newPhotoId = await createPhoto(customFieldId, finalUrls, sizeNumber);
      logs.push(`[item ${i}] createdPhotoId=${newPhotoId}`);

      if (newPhotoId) createdPhotoIds.push(newPhotoId);
    }

    logs.push(`\n[done] createdPhotoIds=${createdPhotoIds.length} elapsedMs=${Date.now() - startedAt}`);

    return {
      createdPhotoIds,
      log: logs.join("\n"),
    };
  } catch (error) {
    logs.push(`\n[ERROR] ${error?.message || error}`);
    logs.push(`[stack] ${error?.stack || ""}`);

    return {
      createdPhotoIds,
      log: logs.join("\n"),
    };
  }
})();
