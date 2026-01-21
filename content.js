// content.js

const BASE_DELAY = 200; // ms – inputlar arası minimum bekleme
console.log("🧷 GAIA content script yüklendi:", window.location.href);
const WAITS = {
  afterValidation: 1200,   // kimlik doğrulama sonrası
  dynamic: 800,            // genel dinamik alanlar
  cityToDistrict: 1500     // il -> ilçe yüklenmesi için
};


// Küçük yardımcılar
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const PLACEHOLDER_EMPTY_VALUES = new Set([
  "0",
  "0.0",
  "0.00",
  "0,0",
  "0,00",
  "0.000",
  "0,000"
]);

function isPlaceholderValue(value) {
  if (value === undefined || value === null) return true;
  const trimmed = value.toString().trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_EMPTY_VALUES.has(trimmed)) return true;
  return false;
}

function isEmptyField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return isPlaceholderValue(el.value);
  }
  return false;
}

// Input/textarea/select değerini güvenli şekilde ayarla ve event'leri tetikle
async function setValueWithEvents(el, value) {
  if (!el) {
    console.log("⚠️ setValueWithEvents: Element bulunamadı");
    return;
  }
  if (!isEmptyField(el)) {
    console.log("⏭️ setValueWithEvents: Alan zaten dolu, atlanıyor:", el.id);
    return;
  }
  if (value === undefined || value === null) {
    console.log("⚠️ setValueWithEvents: Değer yok:", el.id);
    return;
  }
  
  const strValue = String(value).trim();
  console.log(`✏️ Dolduruldu: ${el.id} = "${strValue}"`);
  el.value = strValue;
  dispatchEvents(el);
}

function dispatchEvents(el) {
  if (!el) return;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

async function waitForSelectOptions(selectEl, minOptions = 2, timeoutMs = 5000) {
  if (!selectEl) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (selectEl.options && selectEl.options.length >= minOptions) {
      return;
    }
    await sleep(150);
  }
}


function normalizeTrString(s) {
  if (!s) return "";
  return s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(") // parantez içi/öncesi boşlukları temizle
    .replace(/\s+\)/g, ")")
    // Türkçe karakterleri sadeleştirelim
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

function selectByText(selectEl, text) {
  if (!selectEl) {
    console.log("⚠️ selectByText: Select elementi bulunamadı");
    return;
  }
  if (!isEmptyField(selectEl)) {
    console.log("⏭️ selectByText: Dropdown zaten seçili, atlanıyor:", selectEl.id);
    return;
  }
  if (!text) {
    console.log("⚠️ selectByText: Text değeri yok:", selectEl.id);
    return;
  }

  const target = normalizeTrString(text);
  if (!target) return;

  let exactMatch = null;
  let includesMatch = null;

  for (const opt of selectEl.options) {
    const optLabel = opt.textContent || opt.innerText || opt.value;
    const optNorm = normalizeTrString(optLabel);

    // 1) Tam eşleşme
    if (optNorm === target) {
      exactMatch = opt;
      break;
    }

    // 2) İçeren eşleşme (örn: "aydin" hedefi, "aydin / merkez" seçenek)
    if (!includesMatch && optNorm.includes(target)) {
      includesMatch = opt;
    }
  }

  const chosen = exactMatch || includesMatch;

  if (chosen) {
    console.log(`🔽 Dropdown seçildi: ${selectEl.id} = "${chosen.textContent || chosen.value}" (aranan: "${text}")`);
    selectEl.value = chosen.value;
    dispatchEvents(selectEl);
  } else {
    console.log(`❌ Dropdown eşleşme bulunamadı: ${selectEl.id}, aranan: "${text}"`);
  }
}


async function clickIfVisible(selector, waitAfterMs = 0) {
  const el = document.querySelector(selector);
  if (!el) {
    console.log(`⚠️ clickIfVisible: Element bulunamadı: ${selector}`);
    return;
  }
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    console.log(`⚠️ clickIfVisible: Element görünür değil: ${selector}`);
    return;
  }
  console.log(`🖱️ Click yapıldı: ${selector}${waitAfterMs > 0 ? ` (${waitAfterMs}ms bekleniyor)` : ''}`);
  el.click();
  if (waitAfterMs > 0) {
    await sleep(waitAfterMs);
  }
}

// Tarih formatlayıcı: ISO → "dd.MM.yyyy"
function toTRDate(value) {
  if (!value) {
    console.log("⚠️ toTRDate: Boş tarih değeri");
    return "";
  }
  
  console.log(`📅 Tarih dönüştürülüyor: "${value}"`);
  let d;

  // ISO ile başlıyorsa
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    d = new Date(value);
    console.log("📅 ISO formatı algılandı");
  } else if (value.includes("T")) {
    d = new Date(value);
    console.log("📅 ISO timestamp formatı algılandı");
  } else {
    // Zaten "12.02.2025" gibi ise dokunma
    console.log("📅 Zaten TR formatında, dokunulmuyor");
    return value;
  }

  if (Number.isNaN(d.getTime())) {
    console.log("⚠️ Geçersiz tarih, orijinal değer döndürülüyor");
    return value;
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const result = `${day}.${month}.${year}`;
  console.log(`📅 Tarih dönüştürüldü: "${result}"`);
  return result;
}

// Plaka parçalama: "34 DEMO 7444" → { ilKodu: "34", no: "DEMO7444" }
function splitPlate(str) {
  if (!str) {
    console.log("⚠️ splitPlate: Boş plaka değeri");
    return { ilKodu: "", no: "" };
  }
  
  const trimmed = str.trim();
  console.log(`🚗 Plaka ayrıştırılıyor: "${trimmed}"`);
  const parts = trimmed.split(/\s+/);
  
  if (parts.length === 1) {
    const compact = trimmed.replace(/\s+/g, "");
    const match = compact.match(/^(\d{2})(.+)$/);
    if (match) {
      const ilKodu = match[1];
      const no = match[2].trim();
      console.log(`🚗 Ayrıştırıldı (tek parça) → ilKodu: "${ilKodu}", no: "${no}"`);
      return { ilKodu, no };
    }
    console.log(`🚗 Tek parça ve il kodu bulunamadı, tümü no olarak kaldı: "${compact}"`);
    return { ilKodu: "", no: compact };
  }
  
  const ilKodu = parts[0];
  const no = parts.slice(1).join("");
  console.log(`🚗 Ayrıştırıldı → ilKodu: "${ilKodu}", no: "${no}"`);
  return { ilKodu, no };
}

// İlk dolu değeri bul
function firstNonEmpty(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return "";
  }
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return "";
}

// Önce primary objeden, yoksa fallback'ten değer döndür
function valueFrom(primary, fallback, keys) {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const primaryValue = firstNonEmpty(primary, keyList);
  if (primaryValue !== "") {
    return primaryValue;
  }
  return firstNonEmpty(fallback, keyList);
}

function parseCurrencyNumber(raw) {
  if (raw === undefined || raw === null) return NaN;
  if (typeof raw === "number") return raw;
  let str = String(raw).trim();
  if (!str) return NaN;
  str = str.replace(/\s+/g, "");
  if (str.includes(",") && str.includes(".")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (str.includes(",") && !str.includes(".")) {
    str = str.replace(",", ".");
  }
  str = str.replace(/[^0-9.-]/g, "");
  const num = Number(str);
  return Number.isNaN(num) ? NaN : num;
}

function formatCurrencyValue(raw) {
  const num = parseCurrencyNumber(raw);
  if (Number.isNaN(num)) {
    return raw === undefined || raw === null ? "" : String(raw);
  }
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Sayfa içinde toast gösteren basit fonksiyon
function showToast(message, type = "info", duration = 2000) {
  let toast = document.getElementById("gaia-sbm-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "gaia-sbm-toast";
    document.body.appendChild(toast);
  }
  
  // İkon ekle
  const icons = {
    info: "⏳",
    success: "✅",
    error: "❌"
  };
  
  toast.textContent = `${icons[type] || "ℹ️"} ${message}`;
  toast.style.position = "fixed";
  toast.style.top = "20px";
  toast.style.right = "20px";
  toast.style.padding = "12px 16px";
  toast.style.zIndex = "999999";
  toast.style.borderRadius = "8px";
  toast.style.fontSize = "13px";
  toast.style.fontWeight = "500";
  toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  toast.style.color = "#fff";
  toast.style.backgroundColor =
    type === "error" ? "#d32f2f" : type === "success" ? "#006166" : "#555";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
  toast.style.transition = "all 0.3s ease";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(-10px)";

  // Animasyon
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);

  if (duration > 0) {
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-10px)";
        setTimeout(() => {
          if (toast && toast.parentNode) {
            toast.parentNode.removeChild(toast);
          }
        }, 300);
      }
    }, duration);
  }
}

// GAIA JSON'u storage'dan çeker
function getGaiaData() {
  console.log("📥 Chrome storage'dan GAIA JSON alınıyor...");
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["gaiaJsonRaw"], (res) => {
      if (!res.gaiaJsonRaw) {
        console.error("❌ Chrome storage'da GAIA JSON bulunamadı");
        return reject(new Error("GAIA JSON bulunamadı."));
      }
      console.log("✅ Chrome storage'dan raw JSON alındı, parse ediliyor...");
      try {
        const parsed = JSON.parse(res.gaiaJsonRaw);
        if (!parsed || typeof parsed !== "object") {
          console.error("❌ Parse edilen JSON objesi değil");
          return reject(new Error("GAIA JSON formatı hatalı."));
        }
        if (!parsed.DOSYALAR || typeof parsed.DOSYALAR !== "object") {
          console.error("❌ JSON içinde DOSYALAR objesi yok");
          return reject(
            new Error('JSON içinde "DOSYALAR" alanı bulunamadı.')
          );
        }
        console.log("✅ JSON başarıyla parse edildi ve validate edildi");
        resolve(parsed);
      } catch (e) {
        console.error("❌ JSON parse hatası:", e);
        reject(e);
      }
    });
  });
}


	// TR telefon normalize: "0506 772 12 12" -> "5067721212"
	function normalizeTrMobile(raw) {
	  if (!raw) {
	    console.log("⚠️ normalizeTrMobile: Boş telefon değeri");
	    return "";
	  }
	  
	  const digits = raw.replace(/\D+/g, ""); // tüm rakamları al
	  console.log(`📱 Telefon normalize: "${raw}" → rakamlar: "${digits}"`);

	  // 11 hane ve 0 ile başlıyorsa (klasik 0 5xx xxx xx xx)
	  if (digits.length === 11 && digits.startsWith("0")) {
	    const result = digits.slice(1); // baştaki 0'ı at -> 10 hane
	    console.log(`📱 11 haneli (0 ile başlar) → 10 haneye düşürüldü: "${result}"`);
		return result;
	  }

	  // Zaten 10 hane ise direkt kullan
	  if (digits.length === 10) {
	    console.log(`📱 Zaten 10 haneli: "${digits}"`);
		return digits;
	  }

	  // Uzunsa son 10 haneyi al, kısaysa olduğu gibi dön
	  if (digits.length > 10) {
	    const result = digits.slice(-10);
	    console.log(`📱 10 haneden uzun → son 10 hane: "${result}"`);
		return result;
	  }

	  console.log(`📱 10 haneden kısa → olduğu gibi: "${digits}"`);
	  return digits;
	}









//
// FORM 1 – Başvuruyu Yapan
//
async function fillBasvuruyuYapanForm(dosyalar) {
  console.log("🚀 === FORM 1 BAŞLADI: Başvuruyu Yapan ===");
  showToast("Form 1/3 dolduruluyor: Başvuruyu Yapan", "info", 0);

  // 1- kimlik tipi (dropdown)
  console.log("📋 Adım 1: Kimlik Tipi");
  const kimlikTipi = document.getElementById("basvuruyuYapanForm.kimlikTipi");
  selectByText(kimlikTipi, dosyalar["Davacı Kimlik Tipi"]);
  await sleep(BASE_DELAY);

  // 2- kimlik no (input)
  console.log("📋 Adım 2: Kimlik No");
  const tckn = document.getElementById("basvuruyuYapanForm.basvuranKimlikNo");
  await setValueWithEvents(tckn, dosyalar["Davacı TCKN/VKN"]);
  await sleep(BASE_DELAY);

  // 3- doğrulama butonu (ikon)
  console.log("📋 Adım 3: Doğrulama Butonu");
  await clickIfVisible(
    "#basvuruyuYapanForm\\.basvuranKimlikNo_Icon",
    WAITS.afterValidation
  );

  // 3.5 - Vekil/Temsilci checkbox (her zaman işaretlenir)
  console.log("📋 Adım 3.5: Vekil/Temsilci Checkbox");
  const vekilCheckbox = document.getElementById(
    "basvuruyuYapanForm.vekilTemsilcimi1"
  );
  if (vekilCheckbox && !vekilCheckbox.checked) {
    vekilCheckbox.checked = true;
    dispatchEvents(vekilCheckbox);
    console.log("☑️ Vekil/Temsilci checkbox işaretlendi");
  } else if (vekilCheckbox) {
    console.log("☑️ Vekil/Temsilci checkbox zaten işaretli");
  } else {
    console.log("⚠️ Vekil/Temsilci checkbox bulunamadı");
  }

  // 4- adres (textarea)
  console.log("📋 Adım 4: Adres");
  const adres = document.getElementById(
    "basvuruyuYapanForm.basvuruYapanGercek.adres"
  );
  await setValueWithEvents(adres, dosyalar["Davacı Adresi"]);
  await sleep(BASE_DELAY);

	// 5- il
	console.log("📋 Adım 5: İl");
	const ilEl = document.getElementById(
	  "basvuruyuYapanForm.basvuruYapanGercek.ilKodu"
	);
	const ilValue = dosyalar["Davacı İl"];

	if (ilEl && ilValue) {
	  if (ilEl.tagName === "SELECT") {
		// Select ise, önce seçenekler yüklensin
		console.log("⏳ İl dropdown seçenekleri bekleniyor...");
		await waitForSelectOptions(ilEl, 2, 5000);
		selectByText(ilEl, ilValue);
	  } else {
		await setValueWithEvents(ilEl, ilValue);
	  }
	}

	// İl seçildikten sonra ilçe seçeneklerinin gelmesi için bekle
	console.log(`⏳ İlçe seçenekleri için ${WAITS.cityToDistrict}ms bekleniyor...`);
	await sleep(WAITS.cityToDistrict || 1500);

	// 6- ilçe
	console.log("📋 Adım 6: İlçe");
	const ilceEl = document.getElementById(
	  "basvuruyuYapanForm.basvuruYapanGercek.ilceKodu"
	);
	const ilceValue = dosyalar["Davacı İlçe"];

	if (ilceEl && ilceValue) {
	  if (ilceEl.tagName === "SELECT") {
		// İlçenin seçenekleri de dinamik geliyor olabilir
		console.log("⏳ İlçe dropdown seçenekleri bekleniyor...");
		await waitForSelectOptions(ilceEl, 2, 5000);
		selectByText(ilceEl, ilceValue);
	  } else {
		await setValueWithEvents(ilceEl, ilceValue);
	  }
	}

	await sleep(BASE_DELAY);





	// 7- cep telefonu
	console.log("📋 Adım 7: Cep Telefonu");
	const tel = document.getElementById(
	  "basvuruyuYapanForm.basvuruYapanGercek.cepTelefonu"
	);
	const telValue = normalizeTrMobile(dosyalar["Davacı Tel"]);
	await setValueWithEvents(tel, telValue);
	await sleep(BASE_DELAY);


  // 8- e-posta
  console.log("📋 Adım 8: E-posta");
  const mail = document.getElementById(
    "basvuruyuYapanForm.basvuruYapanGercek.eposta"
  );
  await setValueWithEvents(mail, dosyalar["Davacı Email"]);
  await sleep(BASE_DELAY);

  // 9- KEP (opsiyonel)
  console.log("📋 Adım 9: KEP Adresi");
  const kep = document.getElementById(
    "basvuruyuYapanForm.basvuruYapanGercek.kepAdresi"
  );
  await setValueWithEvents(kep, dosyalar["Davacı Kep"]);
  await sleep(BASE_DELAY);

  console.log("✅ === FORM 1 TAMAMLANDI ===");
  showToast("Form 1/3 tamamlandı!", "success", 2000);
}

//
// FORM 2 – Vekil Bilgileri
//
async function fillVekilBilgileriForm(vekil, fallbackDosyalar = {}) {
  console.log("🚀 === FORM 2 BAŞLADI: Vekil Bilgileri ===");
  console.log("📦 Vekil verisi:", vekil);
  showToast("Form 2/3 dolduruluyor: Vekil Bilgileri", "info", 0);

  // 2- Temsilci Sıfatı
  console.log("📋 Adım 2: Temsilci Sıfatı");
  const temsilciSifati = document.getElementById(
    "vekilBilgileriForm.temsilciSifatTipi"
  );
  const temsilciSifatiValue = valueFrom(vekil, fallbackDosyalar, [
    "Temsilci Sıfatı",
    "Temsilci_Sifati",
    "Temsilci Sifati"
  ]);
  if (temsilciSifati && temsilciSifati.tagName === "SELECT") {
    console.log("⏳ Temsilci Sıfatı dropdown seçenekleri bekleniyor...");
    await waitForSelectOptions(temsilciSifati, 2, 5000);
  }
  console.log("🧾 Temsilci Sıfatı değeri:", temsilciSifatiValue);
  selectByText(temsilciSifati, temsilciSifatiValue);
  await sleep(BASE_DELAY);

  // 3- Vekil Kimlik Tipi
  console.log("📋 Adım 3: Vekil Kimlik Tipi");
  const vekilKimlikTipi = document.getElementById(
    "vekilBilgileriForm.kimlikTipi"
  );
  const vekilKimlikTipiValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil Kimlik Tipi",
    "Vekil Kimlik Turu",
    "Vekil Kimlik Türü",
    "Vekil_Kimlik_Tipi"
  ]);
  if (vekilKimlikTipi && vekilKimlikTipi.tagName === "SELECT") {
    console.log("⏳ Kimlik Tipi dropdown seçenekleri bekleniyor...");
    await waitForSelectOptions(vekilKimlikTipi, 2, 5000);
  }
  console.log("🧾 Vekil Kimlik Tipi değeri:", vekilKimlikTipiValue);
  selectByText(vekilKimlikTipi, vekilKimlikTipiValue);
  await sleep(BASE_DELAY);

  // 4- Vekil TCKN/VKN
  console.log("📋 Adım 4: Vekil TCKN/VKN");
  const vekilTckn = document.getElementById("vekilBilgileriForm.kimlikNo");
  const vekilTcknValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil TCKN/VKN",
    "Vekil TCKN",
    "Vekil VKN",
    "Vekil_TCKN_VKN"
  ]);
  console.log("🧾 Vekil TCKN/VKN değeri:", vekilTcknValue);
  await setValueWithEvents(vekilTckn, vekilTcknValue);
  await sleep(BASE_DELAY);

  // 5- Doğrulama butonuna tıkla → ad soyad sistemden gelsin (1-2 sn bekle)
  console.log("📋 Adım 5: Doğrulama Butonu");
  await clickIfVisible(
    "#vekilBilgileriForm\\.kimlikNo_Icon",
    2000 // 2 saniye bekle
  );

  // 6- Vekil adresi
  console.log("📋 Adım 6: Vekil Adresi");
  const vekilAdres = document.getElementById("vekilBilgileriForm.adres");
  const vekilAdresValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil Adresi",
    "Vekil Adres",
    "Vekil_Buro_Adresi",
    "Vekil Büro Adresi"
  ]);
  console.log("🧾 Vekil Adresi değeri:", vekilAdresValue);
  await setValueWithEvents(vekilAdres, vekilAdresValue);
  await sleep(BASE_DELAY);

  // 7- Vekil il
  console.log("📋 Adım 7: Vekil İl");
  const vekilIlEl = document.getElementById("vekilBilgileriForm.ilKodu");
  const vekilIlValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil İl",
    "Vekil Il",
    "Vekil Sehir"
  ]);

  if (vekilIlEl && vekilIlValue) {
    if (vekilIlEl.tagName === "SELECT") {
      console.log("⏳ Vekil İl dropdown seçenekleri bekleniyor...");
      await waitForSelectOptions(vekilIlEl, 2, 5000);
      selectByText(vekilIlEl, vekilIlValue);
    } else {
      await setValueWithEvents(vekilIlEl, vekilIlValue);
    }
  }

  // İl seçildikten sonra ilçe seçeneklerinin gelmesi için bekle
  console.log(`⏳ İlçe seçenekleri için ${WAITS.cityToDistrict}ms bekleniyor...`);
  await sleep(WAITS.cityToDistrict);

  // 8- Vekil ilçe (dinamik olarak ile bağlı)
  console.log("📋 Adım 8: Vekil İlçe");
  const vekilIlceEl = document.getElementById("vekilBilgileriForm.ilceKodu");
  const vekilIlceValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil İlçe",
    "Vekil Ilce"
  ]);

  if (vekilIlceEl && vekilIlceValue) {
    if (vekilIlceEl.tagName === "SELECT") {
      console.log("⏳ Vekil İlçe dropdown seçenekleri bekleniyor...");
      await waitForSelectOptions(vekilIlceEl, 2, 5000);
      selectByText(vekilIlceEl, vekilIlceValue);
    } else {
      await setValueWithEvents(vekilIlceEl, vekilIlceValue);
    }
  }

  await sleep(BASE_DELAY);

  // 9- Vekil telefon (normalize et)
  console.log("📋 Adım 9: Vekil Telefon");
  const vekilTel = document.getElementById("vekilBilgileriForm.cepTelefonu");
  const vekilTelRaw = valueFrom(vekil, fallbackDosyalar, [
    "Vekil Tel",
    "Vekil Telefon",
    "Vekil Büro Tel",
    "Vekil Cep",
    "Vekil Cep Telefonu"
  ]);
  const vekilTelValue = normalizeTrMobile(vekilTelRaw);
  await setValueWithEvents(vekilTel, vekilTelValue);
  await sleep(BASE_DELAY);

  // 10- Vekil e-posta
  console.log("📋 Adım 10: Vekil E-posta");
  const vekilMail = document.getElementById("vekilBilgileriForm.eposta");
  const vekilMailValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil E-Mail",
    "Vekil Email",
    "Vekil Eposta",
    "Vekil Büro E-Mail"
  ]);
  await setValueWithEvents(vekilMail, vekilMailValue);
  await sleep(BASE_DELAY);

  // 11- Vekil KEP
  console.log("📋 Adım 11: Vekil KEP");
  const vekilKep = document.getElementById("vekilBilgileriForm.kepAdresi");
  const vekilKepValue = valueFrom(vekil, fallbackDosyalar, [
    "Vekil Kep",
    "Vekil KEP",
    "Vekil Kep Adresi"
  ]);
  await setValueWithEvents(vekilKep, vekilKepValue);
  await sleep(BASE_DELAY);

  console.log("✅ === FORM 2 TAMAMLANDI ===");
  showToast("Form 2/3 tamamlandı!", "success", 2000);
}

//
// FORM 3 – Başvuru Konusu Şirket
//
async function fillBasvuruKonusuSirketForm(dosyalar, davali) {
  console.log("🚀 === FORM 3 BAŞLADI: Başvuru Konusu Şirket ===");
  console.log("📦 Dosyalar verisi:", dosyalar);
  console.log("📦 Davalı verisi:", davali);
  showToast("Form 3/3 dolduruluyor: Başvuru Konusu", "info", 0);

  // 1- Sigorta Branş Ayrımı (Dropdown)
  const bransKategori = document.getElementById(
    "basvuruKonusuSirketForm.bransKategoriNo"
  );
  if (bransKategori && bransKategori.tagName === "SELECT") {
    await waitForSelectOptions(bransKategori, 2, 5000);
  }
  selectByText(bransKategori, davali["Sigorta Branş Ayrımı"]);
  await sleep(WAITS.dynamic);

  // 2- Sigorta Ana Branş (Dropdown, dinamik)
  const bransAna = document.getElementById(
    "basvuruKonusuSirketForm.bransSiraNo"
  );
  if (bransAna && bransAna.tagName === "SELECT") {
    await waitForSelectOptions(bransAna, 2, 5000);
  }
  selectByText(bransAna, davali["Sigorta Ana Branş"]);
  await sleep(WAITS.dynamic);

  // 3- Sigorta Alt Branş (Dropdown, dinamik)
  const altBrans = document.getElementById(
    "basvuruKonusuSirketForm.altBransSiraNo"
  );
  if (altBrans && altBrans.tagName === "SELECT") {
    await waitForSelectOptions(altBrans, 2, 5000);
  }
  selectByText(
    altBrans,
    firstNonEmpty(dosyalar, ["Sigorta Alt Brans"]) ||
      davali["Sigorta Alt Brans"]
  );
  await sleep(WAITS.dynamic);

  // 4- Davacı plaka il kodu (dinamik)
  const davaciPlakaStr = dosyalar["Davacı Plaka"];
  const davaciPlaka = splitPlate(davaciPlakaStr);

  const plakaIl = document.getElementById(
    "basvuruKonusuSirketForm.plakaIlKodu"
  );
  await setValueWithEvents(plakaIl, davaciPlaka.ilKodu);
  await sleep(WAITS.dynamic);

  // 5- Davacı plaka no (dinamik)
  const plakaNo = document.getElementById("basvuruKonusuSirketForm.plakaNo");
  await setValueWithEvents(plakaNo, davaciPlaka.no);
  await sleep(WAITS.dynamic);

  // 6- Karşı plaka il kodu (dinamik)
  const karsiPlakaStr = dosyalar["Karşı Plaka"];
  const karsiPlaka = splitPlate(karsiPlakaStr);

  const karsiPlakaIl = document.getElementById(
    "basvuruKonusuSirketForm.karsiTarafPlakaIlKodu"
  );
  await setValueWithEvents(karsiPlakaIl, karsiPlaka.ilKodu);
  await sleep(WAITS.dynamic);

  // 7- Karşı plaka no (dinamik)
  const karsiPlakaNo = document.getElementById(
    "basvuruKonusuSirketForm.karsiTarafPlakaNo"
  );
  await setValueWithEvents(karsiPlakaNo, karsiPlaka.no);
  await sleep(WAITS.dynamic);

  // 8- Hasar tarihi (Kaza Tarihi)
  const hasarTarihi = document.getElementById(
    "basvuruKonusuSirketForm.hasarTarihi"
  );
  await setValueWithEvents(hasarTarihi, toTRDate(dosyalar["Kaza Tarihi"]));
  await sleep(BASE_DELAY);

  // 9- Hasar dosya no (varsa)
  const hasarDosyaNo = document.getElementById(
    "basvuruKonusuSirketForm.hasarDosyaNo"
  );
  await setValueWithEvents(hasarDosyaNo, dosyalar["Hasar Dosya No"]);
  await sleep(BASE_DELAY);

  // 10- Karşı poliçe no
  const policeNo = document.getElementById(
    "basvuruKonusuSirketForm.policeNo"
  );
  await setValueWithEvents(policeNo, dosyalar["Karşı Poliçe No"]);
  await sleep(BASE_DELAY);

  // 11- Uyuşmazlık Tutarı
  const uyusmazlik = document.getElementById(
    "basvuruKonusuSirketForm.uyusmazlikTutari"
  );
  const uyusmazlikRaw = firstNonEmpty(dosyalar, [
    "Tahkim Uyuşmazlık Tutarı",
    "Uyuşmazlık Tutarı HF",
    "Uyuşmazlık Tutarı DK",
    "Uyusmazlik Tutari HF",
    "Uyusmazlik Tutari DK"
  ]);
  const uyusmazlikValue = formatCurrencyValue(uyusmazlikRaw);
  await setValueWithEvents(uyusmazlik, uyusmazlikValue);
  await sleep(BASE_DELAY);

  // 12- Sigorta şirketine başvuru tarihi (İhtar Tarihi)
  const ihtarTarihiInput = document.getElementById(
    "basvuruKonusuSirketForm.sigortaSirketineBasvuruTarihi"
  );
  await setValueWithEvents(
    ihtarTarihiInput,
    toTRDate(dosyalar["İhtar Tarihi"])
  );
  await sleep(BASE_DELAY);

  // 13- İstenen talep tutarı (toplam)
  const istenenTalep = document.getElementById(
    "basvuruKonusuSirketForm.istenenTalepTutari"
  );
  const istenenTalepValue = formatCurrencyValue(
    firstNonEmpty(dosyalar, [
      "Talep Tutarı Toplam",
      "Talep Tutarı",
      "Talep Tutarı DK",
      "Talep Tutarı HF",
      "Talep Tutari DK",
      "Talep Tutari HF"
    ])
  );
  await setValueWithEvents(istenenTalep, istenenTalepValue);
  await sleep(BASE_DELAY);

  // 14- Talep niteliği (Dropdown)
  const talepNitelik = document.getElementById(
    "basvuruKonusuSirketForm.talepNitelikNo"
  );
  if (talepNitelik && talepNitelik.tagName === "SELECT") {
    await waitForSelectOptions(talepNitelik, 2, 5000);
  }
  selectByText(talepNitelik, dosyalar["Talebin Niteliği"]);
  await sleep(BASE_DELAY);

  // 15- Başvuru sebebi (Dropdown)
  const sikayetSebep = document.getElementById(
    "basvuruKonusuSirketForm.sikayetAnaSebep"
  );
  if (sikayetSebep && sikayetSebep.tagName === "SELECT") {
    await waitForSelectOptions(sikayetSebep, 2, 5000);
  }
  selectByText(sikayetSebep, dosyalar["Başvuru Sebebi"]);
  await sleep(WAITS.dynamic);

  // 16- Kısmi ödeme (dinamik olarak başvuru sebebine bağlı)
  const kismiOdeme = document.getElementById(
    "basvuruKonusuSirketForm.kismiOdeme"
  );
  const kismiOdemeValue = formatCurrencyValue(
    firstNonEmpty(dosyalar, ["İhtar Ön Ödeme Tutarı", "İhtar On Odeme Tutarı"])
  );
  await setValueWithEvents(kismiOdeme, kismiOdemeValue);
  await sleep(WAITS.dynamic);

  // 17- Dava türü (Dropdown, dinamik)
  const davaTuru = document.getElementById(
    "basvuruKonusuSirketForm.davaTuru"
  );
  if (davaTuru && davaTuru.tagName === "SELECT") {
    await waitForSelectOptions(davaTuru, 2, 5000);
  }
  selectByText(davaTuru, dosyalar["Dava Türü"]);
  await sleep(BASE_DELAY);

  // 18- Özet talep (TextArea)
  const ozetTalep = document.getElementById(
    "basvuruKonusuSirketForm.ozetTalep"
  );
  await setValueWithEvents(ozetTalep, dosyalar["Ozet Talep"]);
  await sleep(BASE_DELAY);

  // 19- Radio: sigortaKurulusuNihaiCevapVerdimi1
  console.log("📋 Adım 19: Radio Button (İhtar Cevap Durumu)");
  // NOT: Dolu olan inputlara dokunulmamalı şartı olduğu için
  // radio button'lar genelde boş gelir. İhtiyaç olursa açılabilir.
  // Örneğin: İhtar Cevap Durumu kontrolü
  const ihtarCevapDurumu = dosyalar["İhtar Cevap Durumu"];
  if (ihtarCevapDurumu) {
    console.log(`📻 İhtar Cevap Durumu var: ${ihtarCevapDurumu}`);
    // Eğer "Kısmi" veya herhangi bir değer varsa "Evet" seçilebilir
    const radioEvet = document.getElementById(
      "basvuruKonusuSirketForm.sigortaKurulusuNihaiCevapVerdimi1"
    );
    if (radioEvet && !radioEvet.checked) {
      console.log("📻 Radio button 'Evet' seçildi");
      radioEvet.checked = true;
      dispatchEvents(radioEvet);
    }
  } else {
    console.log("⏭️ İhtar Cevap Durumu yok, radio atlandı");
  }

  console.log("✅ === FORM 3 TAMAMLANDI ===");
  showToast("Tüm formlar başarıyla dolduruldu! 🎉", "success", 3000);
}

//
// Hangi formdayız? URL'ye göre seçelim
//
async function fillCurrentFormWithGaia() {
  console.log("🎬 Form doldurma işlemi başlatılıyor...");
  const gaia = await getGaiaData();
  console.log("📦 GAIA JSON verisi alındı:", gaia);
  console.log("🔍 JSON keys:", Object.keys(gaia));
  
  const dosyalar = gaia.DOSYALAR || {};
  
  // Vekil objesi - farklı yerlerde olabilir
  let vekil =
    gaia.Vekil ||
    gaia.vekil ||
    dosyalar.Vekil ||
    dosyalar.vekil ||
    {};
  
  // Eğer ayrı bir Vekil objesi yoksa, DOSYALAR içinden al
  if (Object.keys(vekil).length === 0) {
    console.log("⚠️ Ayrı 'Vekil' objesi bulunamadı, DOSYALAR içinden alınıyor");
    vekil = dosyalar;
  }
  
  // Davalı objesi - farklı yerlerde olabilir
  let davali = gaia.Davalı || gaia.Davali || gaia.davalı || gaia.davali || {};
  
  // Eğer ayrı bir Davalı objesi yoksa, DOSYALAR içinden al veya içinde "Davalı" sub-objesi kontrol et
  if (Object.keys(davali).length === 0) {
    console.log("⚠️ Ayrı 'Davalı' objesi bulunamadı");
    davali = dosyalar.Davalı || dosyalar.Davali || dosyalar;
  }

  console.log("📂 DOSYALAR:", dosyalar);
  console.log("👨‍💼 VEKİL (işlenmiş):", vekil);
  console.log("🏢 DAVALI (işlenmiş):", davali);

  const url = window.location.href;
  console.log("🌐 Aktif sayfa URL:", url);

  if (url.includes("/basvuruYapan.sbm")) {
    console.log("➡️ Form 1'e yönlendiriliyor: Başvuruyu Yapan");
    await fillBasvuruyuYapanForm(dosyalar);
  } else if (url.includes("/vekilBilgileri.sbm")) {
    console.log("➡️ Form 2'ye yönlendiriliyor: Vekil Bilgileri");
    await fillVekilBilgileriForm(vekil, dosyalar);
  } else if (url.includes("/basvuruKonusuSirket.sbm")) {
    console.log("➡️ Form 3'e yönlendiriliyor: Başvuru Konusu Şirket");
    await fillBasvuruKonusuSirketForm(dosyalar, davali);
  } else {
    console.error("❌ Tanınmayan form sayfası:", url);
    showToast("Bu sayfa desteklenen formlardan biri değil", "error", 3000);
    throw new Error("Tanınmayan form sayfası.");
  }
}

// Popup'tan gelen mesajları dinle
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 Popup'tan mesaj alındı:", message);
  
  if (message && message.action === "fillFromGaia") {
    console.log("🎯 'fillFromGaia' aksiyonu tetiklendi");
    fillCurrentFormWithGaia()
      .then(() => {
        console.log("✅ Form doldurma işlemi başarıyla tamamlandı");
        sendResponse({
          ok: true,
          message: "Form doldurma işlemi başlatıldı."
        });

//
// Sayfa yüklenince otomatik doldurma
//
let autoFillTriggeredForPage = false;
let autoFillRetryCount = 0;
const AUTO_FILL_MAX_RETRIES = 10;

function scheduleAutoFillRetry(reason) {
  if (autoFillTriggeredForPage) return;
  if (autoFillRetryCount >= AUTO_FILL_MAX_RETRIES) {
    console.log("⏹️ Otomatik doldurma tekrar limitine ulaşıldı.");
    return;
  }
  autoFillRetryCount += 1;
  const delay = 600 * autoFillRetryCount;
  console.log(
    `🔁 Otomatik doldurma yeniden denenecek (${reason}) → ${delay}ms sonra (deneme #${autoFillRetryCount})`
  );
  setTimeout(() => triggerAutoFill(`${reason}-retry${autoFillRetryCount}`), delay);
}

const AUTO_FILL_URLS = [
  "/basvuruYapan.sbm",
  "/vekilBilgileri.sbm",
  "/basvuruKonusuSirket.sbm"
];

function isAutoFillSupportedUrl() {
  return AUTO_FILL_URLS.some((path) =>
    window.location.pathname.includes(path)
  );
}

function triggerAutoFill(reason = "unknown") {
  console.log(
    `🔍 Otomatik doldurma kontrolü (${reason}) — path: ${window.location.pathname}`
  );
  if (autoFillTriggeredForPage) {
    console.log(`ℹ️ Otomatik doldurma (${reason}) zaten tetiklenmiş.`);
    return;
  }
  if (!isAutoFillSupportedUrl()) {
    console.log(`ℹ️ Otomatik doldurma (${reason}) uygun URL değil.`);
    return;
  }

  chrome.storage.local.get(["gaiaJsonRaw"], (res) => {
    if (!res || !res.gaiaJsonRaw) {
      console.log(
        `ℹ️ Otomatik doldurma (${reason}) pasif: GAIA JSON bulunamadı.`
      );
      scheduleAutoFillRetry("await-json");
      return;
    }

    autoFillTriggeredForPage = true;
    console.log(`🤖 Otomatik doldurma başlatılıyor (${reason}).`);
    fillCurrentFormWithGaia()
      .then(() => {
        console.log("🤖 Otomatik doldurma tamamlandı.");
      })
      .catch((err) => {
        console.warn("⚠️ Otomatik doldurma başarısız:", err);
        autoFillTriggeredForPage = false; // yeniden denemeye izin ver
        scheduleAutoFillRetry("autofill-error");
      });
  });
}

function initializeAutoFillHooks() {
  // İlk deneme (script yüklendiğinde)
  setTimeout(() => triggerAutoFill("initial-timeout"), 400);

  // DOM hazır olduğunda tekrar dene
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    triggerAutoFill("document-ready");
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => triggerAutoFill("DOMContentLoaded"),
      { once: true }
    );
  }

  // BFCache / sayfa geri getirildiğinde
  window.addEventListener("pageshow", (evt) => {
    if (evt.persisted) {
      autoFillTriggeredForPage = false; // BFCache'ten dönünce yeniden dene
    }
    triggerAutoFill("pageshow");
  });
}

initializeAutoFillHooks();
      })
      .catch((err) => {
        console.error("❌ GAIA doldurma hatası:", err);
        showToast("Form doldurma hatası: " + err.message, "error", 4000);
        sendResponse({
          ok: false,
          message: "Form doldurulamadı: " + err.message
        });
      });

    // async sendResponse kullanacağımız için true döndürüyoruz
    return true;
  }
});

//
// Sayfa yüklenince otomatik doldurma
//
let autoFillTriggeredForPage = false;
let autoFillRetryCount = 0;
const AUTO_FILL_MAX_RETRIES = 10;

function scheduleAutoFillRetry(reason) {
  if (autoFillTriggeredForPage) return;
  if (autoFillRetryCount >= AUTO_FILL_MAX_RETRIES) {
    console.log("⏹️ Otomatik doldurma tekrar limitine ulaşıldı.");
    return;
  }
  autoFillRetryCount += 1;
  const delay = 600 * autoFillRetryCount;
  console.log(
    `🔁 Otomatik doldurma yeniden denenecek (${reason}) → ${delay}ms sonra (deneme #${autoFillRetryCount})`
  );
  setTimeout(() => triggerAutoFill(`${reason}-retry${autoFillRetryCount}`), delay);
}

const AUTO_FILL_URLS = [
  "/basvuruYapan.sbm",
  "/vekilBilgileri.sbm",
  "/basvuruKonusuSirket.sbm"
];

function isAutoFillSupportedUrl() {
  return AUTO_FILL_URLS.some((path) =>
    window.location.pathname.includes(path)
  );
}

function triggerAutoFill(reason = "unknown") {
  console.log(
    `🔍 Otomatik doldurma kontrolü (${reason}) — path: ${window.location.pathname}`
  );
  if (autoFillTriggeredForPage) {
    console.log(`ℹ️ Otomatik doldurma (${reason}) zaten tetiklenmiş.`);
    return;
  }
  if (!isAutoFillSupportedUrl()) {
    console.log(`ℹ️ Otomatik doldurma (${reason}) uygun URL değil.`);
    return;
  }

  chrome.storage.local.get(["gaiaJsonRaw"], (res) => {
    if (!res || !res.gaiaJsonRaw) {
      console.log(
        `ℹ️ Otomatik doldurma (${reason}) pasif: GAIA JSON bulunamadı.`
      );
      scheduleAutoFillRetry("await-json");
      return;
    }

    autoFillTriggeredForPage = true;
    console.log(`🤖 Otomatik doldurma başlatılıyor (${reason}).`);
    fillCurrentFormWithGaia()
      .then(() => {
        console.log("🤖 Otomatik doldurma tamamlandı.");
      })
      .catch((err) => {
        console.warn("⚠️ Otomatik doldurma başarısız:", err);
        autoFillTriggeredForPage = false; // yeniden denemeye izin ver
        scheduleAutoFillRetry("autofill-error");
      });
  });
}

function initializeAutoFillHooks() {
  // İlk deneme (script yüklendiğinde)
  setTimeout(() => triggerAutoFill("initial-timeout"), 400);

  // DOM hazır olduğunda tekrar dene
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    triggerAutoFill("document-ready");
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => triggerAutoFill("DOMContentLoaded"),
      { once: true }
    );
  }

  // BFCache / sayfa geri getirildiğinde
  window.addEventListener("pageshow", (evt) => {
    if (evt.persisted) {
      autoFillTriggeredForPage = false; // BFCache'ten dönünce yeniden dene
    }
    triggerAutoFill("pageshow");
  });
}

initializeAutoFillHooks();