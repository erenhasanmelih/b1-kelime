# B1 Kelime Kartları

Cambridge B1 Preliminary listesindeki 3.113 kelime için Android uygulaması.

## 📲 Telefona kur

**[Son sürümü indir → B1-Kelime.apk](https://github.com/erenhasanmelih/b1-kelime/releases/latest/download/B1-Kelime.apk)**

1. Yukarıdaki linke telefondan dokun, APK inecek.
2. İnen dosyayı aç → **Yükle**.
3. İlk seferde Android "bilinmeyen uygulamalar" izni ister: **Ayarlar → Bu kaynaktan izin ver**'i aç, geri dön, **Yükle**.

Tüm sürümler: [Releases](https://github.com/erenhasanmelih/b1-kelime/releases)

## Neler var

- 🔊 Kelimenin ve örnek cümlenin telaffuzu (sadece 🔊 düğmesine basınca okunur, İngiltere İngilizcesi)
- 🔁 Tekrar sayfasında **Öğreniyorum** ve **Öğrendim** listeleri ayrı; istediğin listeyle kart çalışırsın
- 📅 Günde 35 yeni kelime; bir günü kaçırırsan kelimeler kaybolmaz, ertesi gün kaldığın yerden devam eder
- ✈️ İnternetsiz çalışır
- 💾 İlerleme telefonda kalır; **İlerleme → Yedekle / taşı** ile kodla yedeklenir ve başka yerden aktarılır

## Güncelleme

Bu repoya yapılan her değişiklikte GitHub Actions yeni bir APK üretir ve **Releases**'e koyar.
Uygulama açılışta yeni sürümü fark eder: **İlerleme → İndir** ile yeni APK'yı kurarsın. Aynı imzayla imzalandığı için üstüne kurulur, ilerleme silinmez.

## Ses gelmezse

Telefonda **Ayarlar → Sistem → Diller → Metin okuma çıkışı**: tercih edilen motor **Google'ın konuşma hizmetleri** olsun ve İngilizce (Birleşik Krallık) ses verisi yüklü olsun.

## Proje yapısı

| Yol | Ne işe yarar |
| --- | --- |
| `www/` | Uygulamanın kendisi (HTML, CSS, JS, `words.json`) |
| `www/words.json` | 3.113 kelime: `[kelime, tür, emoji, Türkçe, örnek cümle]` |
| `android/` | Capacitor Android projesi |
| `.github/workflows/android.yml` | APK'yı derleyip Release'e koyan iş akışı |

Bir kelimeyi düzeltmek için `www/words.json` içindeki satırı düzenleyip kaydetmen yeter; birkaç dakika sonra yeni APK Releases'te olur.
