# Bubble Toolbox Plugin Ayarları (backend workflow script)

Bu doküman `bubble-backend-photo-workflow.js` için Bubble tarafında hangi key/value alanlarını girmen gerektiğini açıklar.

## ⚠️ Kritik: Script alanına ne yapıştırılacak?
- **Server script** alanına yalnızca `bubble-backend-photo-workflow.js` dosyasının JavaScript kodunu yapıştır.
- `bubble-backend-photo-workflow-usage.md` içeriğini script alanına yapıştırma (başındaki `#` nedeniyle **SyntaxError: Invalid or unexpected token** alırsın).
- Log'da `Running actionNode script:# Bubble Toolbox Plugin Ayarları ...` görüyorsan yanlış dosya yapıştırılmış demektir.

## 1) Çalıştırma tipi
- Plugin: **Toolbox -> Run javascript** (backend workflow'da).
- Script alanına: **sadece JS kodu** (`bubble-backend-photo-workflow.js`) koy.

## 2) Gerekli key/value alanları
Aşağıdaki key'leri Bubble'da gönder:

- `output4` (text)
- `token` (text)

### `output4` örnek JSON
```json
{
  "version": 1,
  "items": [
    {
      "customFieldName": "Evrakları Yükle Toplu",
      "keptUrls": ["https://.../old1.jpg"],
      "removedUrls": ["https://.../old2.jpg"],
      "newFiles": [
        {
          "filename": "belge-1.jpg",
          "contentType": "image/jpeg",
          "base64": "data:image/jpeg;base64,/9j/4AAQ..."
        }
      ]
    }
  ]
}
```

## 3) Önerilen opsiyonel key/value alanları
- `env`: `version-test` veya `live`
- `domain`: ör. `https://gaiasphere.io`
- `customFieldMapJson`: `{"Evrakları Yükle Toplu":"1763...x..."}`

### `env` ve `domain` nasıl yazılmalı?
- `env` için güvenli değerler:
  - Test ortamı: `version-test`
  - Canlı ortam: `live`
- Script ayrıca `prod` / `production` / `version-live` yazılırsa bunu otomatik `live` olarak kabul eder.
- `version-test` yazarsan test ortamı olarak çalışır (desteklenir).
- `domain` tam kök domain olmalı, örnek:
  - ✅ `https://gaiasphere.io`
  - ✅ `https://gaiasphere.io/` (sondaki `/` script tarafından temizlenir)
  - ❌ `gaiasphere.io` (protokolsüz yazma)
  - ❌ `https://gaiasphere.io/version-test` (path ekleme, script zaten ekliyor)

### Mevcut photo kayıtlarını update etmek için
Eğer elinde düzenlenecek photo id'leri varsa iki yöntem var:

1. **Global map ile**
   - `createdPhotoMapJson`: `{"Evrakları Yükle Toplu":"1739999999999x123"}`
2. **Item bazlı**
   - `output4.items[].photoId` alanını gönder.

Öncelik: `item.photoId` > `createdPhotoMapJson[customFieldName]`.

## 4) Bubble Data Type / Field ismi farklıysa
Varsayılanlar:
- Type: `Photos`
- Field(custom field ref): `CustomField`
- Field(url list): `Urls`
- Field(size): `Size`

Bunlar farklıysa şu key'lerle override et:
- `photoType`
- `photoFieldCustomField`
- `photoFieldUrls`
- `photoFieldSize`

## 5) Script çıktıları (senin istediğin sade format)
Bubble Toolbox'ta **Multiple Outputs = ON** yap.

Bu script özellikle şu iki alanı döndürür:

- `output1` (text): hatalar tek bir metin olarak (satır satır). Hata yoksa boş string.
- `outputlist1` (list of text): oluşturulan `createdPhotoIds` listesi.

Not: Response objesinde sadece bu iki key döner (`output1`, `outputlist1`).

## 6) Bubble'da hızlı örnek key/value seti
- key: `env` value: `version-test`
- key: `domain` value: `https://gaiasphere.io`
- key: `token` value: `YOUR_BUBBLE_API_TOKEN`
- key: `customFieldMapJson` value: `{"Evrakları Yükle Toplu":"1763...x..."}`
- key: `createdPhotoMapJson` value: `{"Evrakları Yükle Toplu":"1739...x..."}`
- key: `output4` value: (yukarıdaki JSON string)

## 7) Sık hata nedenleri
- `token` boş -> API çağrısı başlamadan hata verir.
- `customFieldMapJson` içinde `customFieldName` yok -> item bazında hata verir.
- `output4` JSON değil -> parse hatası verir.
- `newFiles[].base64` boş -> ilgili dosyayı skip eder.
