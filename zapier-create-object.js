const BASE64_REGEX = /^(?:data:[^;]+;base64,)?[A-Za-z0-9+/]+={0,2}$/;
const BASE64_MIN_LENGTH = 64;

const isBase64String = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  if (value.startsWith('data:') && value.includes(';base64,')) {
    return true;
  }

  const trimmed = value.trim();
  if (trimmed.length < BASE64_MIN_LENGTH) {
    return false;
  }

  return BASE64_REGEX.test(trimmed);
};

const normalizeBase64 = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const dataUrlMarker = ';base64,';
  const markerIndex = value.indexOf(dataUrlMarker);
  if (value.startsWith('data:') && markerIndex !== -1) {
    return value.slice(markerIndex + dataUrlMarker.length);
  }

  return value;
};

const uploadFile = async (z, bundle, base64Contents, filename) => {
  const options = {
    url: 'https://gaiasphere.io/version-live/api/1.1/wf/uploadfile',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bundle.authData.access_token}`
    },
    body: {
      attach_to: bundle.inputData.organisation_id,
      key_file: {
        filename: filename || 'upload.jpg',
        contents: base64Contents,
        private: true
      }
    }
  };

  const response = await z.request(options);
  response.throwForStatus();
  return response.json;
};

const createPhoto = async (z, bundle, url) => {
  const options = {
    url: 'https://gaiasphere.io/version-live/api/1.1/obj/photos',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bundle.authData.access_token}`
    },
    body: {
      Url: url
    }
  };

  const response = await z.request(options);
  response.throwForStatus();
  return response.json;
};

const collectKeyValuePairs = async (z, bundle) => {
  const excludedKeys = new Set([
    'Value',
    'sheet',
    'organisation_id',
    'fieldtosearch',
    'action',
    'referencevalue'
  ]);

  const createdPhotos = [];

  const keyValuePairs = await Promise.all(
    Object.entries(bundle.inputData)
      .filter(([key]) => !excludedKeys.has(key))
      .map(async ([key, value]) => {
        if (Array.isArray(value)) {
          const processedValues = [];

          for (const entry of value) {
            if (isBase64String(entry)) {
              const uploaded = await uploadFile(
                z,
                bundle,
                normalizeBase64(entry),
                `${key}-${Date.now()}.jpg`
              );
              const photo = await createPhoto(z, bundle, uploaded.url || uploaded.file_url);
              createdPhotos.push(photo.id);
              processedValues.push(photo.id);
            } else {
              processedValues.push(entry);
            }
          }

          return { key, value: processedValues };
        }

        if (isBase64String(value)) {
          const uploaded = await uploadFile(
            z,
            bundle,
            normalizeBase64(value),
            `${key}-${Date.now()}.jpg`
          );
          const photo = await createPhoto(z, bundle, uploaded.url || uploaded.file_url);
          createdPhotos.push(photo.id);
          return { key, value: photo.id };
        }

        return { key, value };
      })
  );

  return { keyValuePairs, createdPhotos };
};

const createObject = async (z, bundle) => {
  const { keyValuePairs, createdPhotos } = await collectKeyValuePairs(z, bundle);

  const options = {
    url: 'https://gaiasphere.io/version-live/api/1.1/wf/apicreateobject',
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${bundle.authData.access_token}`
    },
    params: {},
    body: {
      sheet: bundle.inputData.sheet,
      organisation_id: bundle.inputData.organisation_id,
      action: bundle.inputData.action,
      referencevalue: bundle.inputData.referencevalue,
      createdphotos: createdPhotos,
      keyValuePairs
    }
  };

  const response = await z.request(options);
  response.throwForStatus();
  return response.json;
};

return createObject(z, bundle);
