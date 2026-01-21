// popup.js

const jsonInput = document.getElementById("jsonInput");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const fillBtn = document.getElementById("fillBtn");
const gotoFormBtn = document.getElementById("gotoFormBtn");
const statusEl = document.getElementById("status");

let statusTimeout = null;

function setStatus(message, type = "ok", autohide = true) {
  statusEl.textContent = message || "";
  statusEl.className = "";
  
  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }
  
  if (message) {
    statusEl.classList.add(type);
    
    if (autohide) {
      statusTimeout = setTimeout(() => {
        statusEl.style.opacity = "0";
        setTimeout(() => {
          statusEl.textContent = "";
          statusEl.className = "";
        }, 200);
      }, 3000);
    }
  }
}

// Popup açıldığında kaydedilmiş JSON'u yükle
document.addEventListener("DOMContentLoaded", () => {
  console.log("🎨 Popup açıldı, kaydedilmiş JSON aranıyor...");
  chrome.storage.local.get(["gaiaJsonRaw"], (res) => {
    if (res.gaiaJsonRaw) {
      console.log("✅ Kaydedilmiş JSON bulundu, textarea'ya yükleniyor");
      jsonInput.value = res.gaiaJsonRaw;
      setStatus("Önceden kaydedilmiş GAIA JSON yüklendi.", "ok");
    } else {
      console.log("ℹ️ Kaydedilmiş JSON bulunamadı");
    }
  });
});

saveBtn.addEventListener("click", () => {
  console.log("💾 Kaydet butonuna tıklandı");
  const raw = jsonInput.value.trim();
  if (!raw) {
    console.warn("⚠️ Textarea boş");
    setStatus("❌ Kaydedilecek JSON bulunamadı.", "error");
    return;
  }

  console.log("🔍 JSON parse ediliyor...");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Geçersiz JSON formatı");
    }
    console.log("✅ JSON geçerli, kayıt ediliyor...");
  } catch (e) {
    console.error("❌ JSON parse hatası:", e);
    setStatus("❌ JSON parse hatası: " + e.message, "error");
    return;
  }

  chrome.storage.local.set({ gaiaJsonRaw: raw }, () => {
    console.log("✅ JSON chrome.storage'a kaydedildi");
    setStatus("✅ JSON kaydedildi.", "ok");
  });
});

clearBtn.addEventListener("click", () => {
  console.log("🗑️ Temizle butonuna tıklandı");
  if (jsonInput.value.trim() === "") {
    console.log("ℹ️ Textarea zaten boş");
    setStatus("⚠️ Zaten boş.", "error");
    return;
  }
  
  console.log("🗑️ Textarea ve storage temizleniyor...");
  jsonInput.value = "";
  chrome.storage.local.remove("gaiaJsonRaw", () => {
    console.log("✅ JSON temizlendi");
    setStatus("✅ JSON temizlendi.", "ok");
  });
});

fillBtn.addEventListener("click", () => {
  console.log("✨ Verileri Doldur butonuna tıklandı");
  const raw = jsonInput.value.trim();
  if (!raw) {
    console.warn("⚠️ Textarea boş, JSON yok");
    setStatus("❌ Önce GAIA JSON yapıştırın.", "error");
    return;
  }

  // Önce kaydetmeyi de deneyelim ki storage senkron olsun
  console.log("🔍 JSON validate ediliyor...");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Geçersiz JSON");
    }
    console.log("✅ JSON geçerli");
  } catch (e) {
    console.error("❌ JSON parse hatası:", e);
    setStatus("❌ JSON parse hatası: " + e.message, "error");
    return;
  }

  console.log("💾 JSON storage'a kaydediliyor...");
  chrome.storage.local.set({ gaiaJsonRaw: raw }, () => {
    console.log("✅ JSON kaydedildi");
    setStatus("⏳ Form dolduruluyor...", "ok", false);
    
    // Aktif sekmeye "fillFromGaia" mesajını gönder
    console.log("🔍 Aktif sekme aranıyor...");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id) {
        console.error("❌ Aktif sekme bulunamadı");
        setStatus("❌ Aktif sekme bulunamadı.", "error");
        return;
      }

      console.log(`📤 Mesaj gönderiliyor (Tab ID: ${tab.id}):`, { action: "fillFromGaia" });
      chrome.tabs.sendMessage(
        tab.id,
        { action: "fillFromGaia" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("❌ Content script hatası:", chrome.runtime.lastError);
            setStatus(
              "❌ İçerik scriptine ulaşılamadı. SBM form sayfasında mısınız?",
              "error"
            );
            return;
          }

          console.log("📥 Content script'ten yanıt alındı:", response);
          if (response && response.ok) {
            console.log("✅ Form doldurma başlatıldı");
            setStatus("✅ Form doldurma başlatıldı!", "ok");
          } else {
            console.error("❌ Form doldurma başlatılamadı:", response);
            setStatus(
              "❌ " + ((response && response.message) || "Form doldurma başlatılamadı."),
              "error"
            );
          }
        }
      );
    });
  });
});

gotoFormBtn.addEventListener("click", () => {
  console.log("🔗 Forma Git butonuna tıklandı");
  const url =
    "https://online.sbm.org.tr/sbm-tahkim/public/onlineBasvuru/basvuruYapan.sbm";
  console.log(`🌐 Yeni sekme açılıyor: ${url}`);
  chrome.tabs.create({ url });
  setStatus("✅ Form sayfası açılıyor...", "ok");
  console.log("✅ Yeni sekme oluşturuldu");
});
