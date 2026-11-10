# Beenget WhatsApp Asistanı

Beenget'in WhatsApp Business numarasına gelen mesajları yapay zekâ ile 7/24 cevaplayan asistan.

**Ne yapar?**
- Müşterinin dilinde (Türkçe, İngilizce, Almanca, Rusça…) anında cevap verir.
- Sadece `knowledge/business.js` dosyasındaki bilgilere dayanır; fiyat, şart veya müsaitlik uydurmaz.
- Kiralama isteyen müşteriden alış yeri, tarihler ve isim gibi bilgileri toplar, **rezervasyon talebini** Supabase'e kaydeder ve size e-posta ile bildirir.
- Şikâyet, hasar, mevcut rezervasyon değişikliği veya "insanla görüşmek istiyorum" gibi durumlarda konuşmayı **size devreder**. Bot o müşteriye 12 saat cevap vermez, siz devralırsınız.
- Kendi kişisel WhatsApp numaranızdan komutlarla botu yönetirsiniz.

**Altyapı:** Vercel (sunucu), WhatsApp Cloud API (Meta), Vercel AI Gateway (yapay zekâ), Supabase (veritabanı), Resend (e-posta bildirimi). Kodun ek bir paket bağımlılığı yoktur.

---

## Kurulum (yaklaşık 1 saat)

### 1) Supabase tablolarını oluşturun
Supabase > projeniz > **SQL Editor** > New query > `supabase/schema.sql` dosyasının içeriğini yapıştırın > **Run**.
Ardından **Project Settings > API** bölümünden `Project URL` ve `service_role` anahtarını not alın.

### 2) Yapay zekâ (ücretsiz)
Varsayılan olarak **Vercel AI Gateway** kullanılır: Vercel'de çalışırken anahtar gerekmez, her ay 5$ ücretsiz kredi gelir (kredi satın almadığınız sürece ücretsiz kalır). Model `AI_MODEL` ile seçilir (varsayılan `google/gemini-3.8-flash`).
Alternatifler: `GEMINI_API_KEY` (Google AI Studio, ücretsiz katman) veya `ANTHROPIC_API_KEY` (Claude, ücretli). Hangi anahtar girilirse o kullanılır; `AI_PROVIDER=gateway|gemini|anthropic` ile zorlayabilirsiniz.

### 3) WhatsApp Cloud API'yi kurun
1. business.facebook.com üzerinde bir **Meta Business** hesabınız olsun (Beenget adına).
2. developers.facebook.com > **Create App** > tür: **Business** > uygulamaya **WhatsApp** ürününü ekleyin.
3. **WhatsApp > API Setup** bölümünde işletme numaranızı ekleyip doğrulayın.
   - Numara şu an normal WhatsApp/WhatsApp Business uygulamasında kayıtlıysa: ya uygulamadan silinmesi gerekir, ya da Meta'nın sunduğu **"coexistence"** (WhatsApp Business uygulaması + API birlikte) seçeneği kullanılır. Coexistence ile telefondaki uygulamadan da cevap yazmaya devam edebilirsiniz.
4. **Phone number ID** değerini not alın.
5. Kalıcı erişim anahtarı: Business Settings > **System users** > yeni sistem kullanıcısı (Admin) > uygulamayı ve WhatsApp hesabını atayın > **Generate token** (izinler: `whatsapp_business_messaging`, `whatsapp_business_management`). Geçici 24 saatlik anahtarı kullanmayın.
6. Uygulama > **Settings > Basic** > **App secret** değerini not alın.

### 4) Vercel'e yükleyin
1. Bu klasörü GitHub'da yeni bir repoya yükleyin (or. `beenget-wp-asistan`).
2. Vercel > **Add New > Project** > repoyu seçin > Deploy. Framework ayarına gerek yok.
3. Vercel > proje > **Settings > Environment Variables** bölümüne `.env.example` içindeki değişkenleri girin, sonra **Redeploy** edin.

### 5) Webhook'u bağlayın
developers.facebook.com > uygulamanız > **WhatsApp > Configuration** > Webhook:
- **Callback URL:** `https://<vercel-proje-adi>.vercel.app/api/webhook`
- **Verify token:** `WHATSAPP_VERIFY_TOKEN` olarak girdiğiniz değer
- **Verify and save** deyin, ardından **Webhook fields** listesinden **messages** alanına abone olun.

### 6) Test edin
Başka bir telefondan işletme numarasına "Merhaba, 20 Haziran'da Dalaman Havalimanı'ndan 5 günlüğüne araç kiralamak istiyorum" yazın.

---

## Bilgi bankasını doldurun (önemli)
`knowledge/business.js` dosyasında `[DOLDURUN]` yazan yerleri gerçek bilgilerinizle değiştirin: fiyat aralıkları, depozito, yaş şartı, teslim ücretleri, iptal koşulları vb. Doldurulmamış konularda asistan bilgiyi ekibin teyit edeceğini söyler. Dosyayı GitHub'da düzenleyip kaydettiğinizde Vercel otomatik olarak yeniden yayınlar.

## Kişisel numaradan komutlar
`OWNER_WA_ID` olarak girdiğiniz **kişisel** numaranızdan işletme numarasına yazın:

| Komut | Ne yapar |
|---|---|
| `#durum` | Ekibe devredilmiş konuşmaları listeler |
| `#devral 905XXXXXXXXX` | O müşteride botu durdurur |
| `#bot 905XXXXXXXXX` | O müşteride botu tekrar açar |
| `#gonder 905XXXXXXXXX mesaj` | Müşteriye işletme numarasından mesaj gönderir |
| `#yardim` | Komut listesi |

Not: WhatsApp kuralı gereği sahibe WhatsApp bildirimi, ancak son 24 saat içinde kişisel numaranızdan işletme numarasına bir mesaj yazdıysanız gider. E-posta bildirimleri (Resend) her zaman gider.

## Rezervasyon taleplerini görmek
Supabase > **Table Editor** > `wa_reservation_requests`. Talebi işledikten sonra `status` sütununu `teyit_edildi` veya `iptal` yapabilirsiniz. Tüm yazışmalar `wa_messages` tablosundadır.

## Maliyet (yaklaşık)
- **Yapay zekâ:** Vercel AI Gateway'in aylık 5$ ücretsiz kredisi küçük bir işletme için genelde yeterlidir; biterse ay sonuna kadar asistan "ekibimiz dönecek" yedek cevabını verir.
- **WhatsApp:** müşterinin başlattığı konuşmalara 24 saat içinde verilen cevaplar için Meta'nın güncel fiyatlandırmasına bakın.
- **Vercel, Supabase, Resend:** küçük hacimde ücretsiz planlar yeterli.

## Testler
```
npm test
```
Gerçek servislere bağlanmadan, sahte (mock) API'lerle tüm akışı dener.
