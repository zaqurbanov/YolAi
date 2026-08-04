// Road-signs course content ("Yol Nişanları" — hekayə ilə öyrən).
// Source document in the live DB: "Yol Nişanları" (6d157672-7441-4062-8b5b-a3d3f59c0e0d).
// Every fact below is grounded in that document's chunks (the official sign
// descriptions). Story dressing is added, but no rule, number or meaning is
// invented. Each lesson carries: title, sign codes (for images + citations),
// markdown content (restricted subset + `![nisan:X]` markers) and a
// published-ready question pool (4 options, one correct, explanation).

// SIGN: code -> { match: unique fragment of the chunk content used to resolve
// the chunk id from the live DB (codes repeat between the sign catalog and the
// markings section; the fragment disambiguates). }
export const SIGN = {
  '1.2':  { match: 'Şlaqbaumsuz dəmir yol keçidi' },
  '1.5':  { match: 'Tramvay xətti ilə kəsişmə' },
  '1.6':  { match: 'Eyni əhəmiyyətli yolların kəsişməsi' },
  '1.7':  { match: 'Dairəvi hərəkətlə kəsişmə' },
  '1.8':  { match: 'Svetoforla nizamlama' },
  '1.9':  { match: 'Ayrılan körpü' },
  '1.10': { match: 'Sahilboyuna çıxış' },
  '1.13': { match: 'Sərt eniş' },
  '1.14': { match: 'Sərt yoxuş' },
  '1.15': { match: 'Sürüşkən yol' },
  '1.16': { match: 'Nahamar yol' },
  '1.17': { match: 'Çınqıl sıçrayışı' },
  '1.19': { match: 'İkitərəfli hərəkət' },
  '1.20': { match: 'Piyada keçidi' },
  '1.21': { match: 'Uşaqlar' },
  '1.22': { match: 'Velosiped zolağı ilə kəsişmə' },
  '1.23': { match: 'Yol işləri' },
  '1.24': { match: 'Mal-qara keçidi' },
  '1.25': { match: 'Vəhşi heyvanlar' },
  '1.26': { match: 'Daş uçqunu' },
  '1.27': { match: 'Yandan əsən külək' },
  '1.28': { match: 'Alçaqdan uçan təyyarələr' },
  '1.29': { match: 'Tunel' },
  '1.30': { match: 'Digər təhlükələr' },
  '2.1':  { match: 'Baş yol (Nizamlanmayan' },
  '2.2':  { match: 'Baş yolun sonu' },
  '2.4':  { match: 'Yol ver' },
  '2.5':  { match: 'Dayanmadan keçmək qadağandır' },
  '2.6':  { match: 'Qarşıdan hərəkətin üstünlüyü' },
  '2.7':  { match: 'Qarşıdan hərəkətə nisbətən üstünlük' },
  '3.1':  { match: 'Giriş qadağandır' },
  '3.2':  { match: 'Hərəkət qadağandır' },
  '3.3':  { match: 'Mexaniki nəqliyyat vasitələrinin hərəkəti qadağandır' },
  '3.4':  { match: 'Yük avtomobillərinin hərəkəti qadağandır' },
  '3.5':  { match: 'Motosikletlərin hərəkəti qadağandır' },
  '3.6':  { match: 'Traktorların hərəkəti qadağandır' },
  '3.7':  { match: 'Qoşqu ilə hərəkət qadağandır' },
  '3.8':  { match: 'At-araba ilə hərəkət qadağandır' },
  '3.9':  { match: 'Velosipedlərlə və mopedlərlə hərəkət qadağandır' },
  '3.10': { match: 'Piyadaların hərəkəti qadağandır' },
  '3.11': { match: 'Kütlənin məhdudlaşdırılması' },
  '3.12': { match: 'Oxa düşən ağırlığın məhdudlaşdırılması' },
  '3.13': { match: 'Hündürlüyün məhdudlaşdırılması' },
  '3.14': { match: 'Enin məhdudlaşdırılması' },
  '3.15': { match: 'Uzunluğun məhdudlaşdırılması' },
  '3.16': { match: 'Minimum ara məsafənin məhdudlaşdırılması' },
  '3.19': { match: 'Geriyə dönmək qadağandır' },
  '3.20': { match: 'Ötmək qadağandır' },
  '3.21': { match: 'Ötməyin qadağan edildiyi zonanın qurtaracağı' },
  '3.22': { match: 'Yük avtomobillərinin ötməsi qadağandır' },
  '3.23': { match: 'Yük avtomobillərinin ötməsi qadağan edilmiş zonanın qurtaracağı' },
  '3.24': { match: 'Maksimum sürətin məhdudlaşdırılması' },
  '3.25': { match: 'Maksimum sürətin məhdudlaşdırıldığı zonanın qurtaracağı' },
  '3.26': { match: 'Səs siqnalı vermək qadağandır' },
  '3.27': { match: 'Dayanmaq qadağandır' },
  '3.28': { match: 'Durmaq qadağandır' },
  '3.29': { match: 'Ayın tək günlərində durmaq qadağandır' },
  '3.30': { match: 'Ayın cüt günlərində durmaq qadağandır' },
  '3.31': { match: 'Bütün məhdudiyyətlər zonasının qurtaracağı' },
  '3.32': { match: 'Ehtiyat üçün ayrılmış duracaq yeri' },
  '3.33': { match: 'Nəqliyyat vasitələrinin kateqoriyalarına uyğun sürətin məhdudlaşdırılması' },
  '3.34': { match: 'Təhlükəli yükü olan nəqliyyat vasitələrinin hərəkəti qadağandır' },
  '3.35': { match: 'Partlayıcı və tezalışan yükü olan nəqliyyat vasitələrinin hərəkəti qadağandır' },
  '4.3':  { match: 'Dairəvi hərəkət' },
  '4.4':  { match: 'Minik avtomobillərinin hərəkəti' },
  '4.5':  { match: 'Velosiped zolağı' },
  '4.6':  { match: 'Piyada zolağı' },
  '4.7':  { match: 'Minimum sürətin məhdudlaşdırılması' },
  '4.8':  { match: 'Minimum sürətin məhdudlaşdırıldığı zonanın qurtaracağı' },
  '5.1':  { match: 'Avtomagistral' },
  '5.2':  { match: 'Avtomagistralın qurtaracağı' },
  '5.3':  { match: 'Avtomobillər üçün yol' },
  '5.4':  { match: 'Avtomobillər üçün yolun qurtaracağı' },
  '5.5':  { match: 'Birtərəfli yol' },
  '5.6':  { match: 'Birtərəfli yolun qurtaracağı' },
  '5.9':  { match: 'Marşrut nəqliyyat vasitələri üçün zolaq' },
  '5.14': { match: 'Minik taksilərinin dayanacaq yeri' },
  '5.15': { match: 'Duracaq yeri' },
  '5.18': { match: 'Tövsiyə edilən sürət' },
  '5.22': { match: '5.22 Yaşayış məntəqəsinin başlanğıcı' },
  '5.23': { match: '5.23 Yaşayış məntəqəsinin qurtaracağı' },
  '5.24': { match: '5.24 Yaşayış məntəqəsinin başlanğıcı' },
  '5.25': { match: '5.25 Yaşayış məntəqəsinin qurtaracağı' },
  '5.27': { match: 'Məsafələr göstəricisi' },
  '5.28': { match: 'Killometr göstəricisi' },
  '5.33': { match: 'Stop-xətt' },
  '5.35': { match: 'Qarşılıqlı hərəkət' },
  '5.36': { match: 'Qarşılıqlı hərəkətin qurtaracağı' },
  '5.37': { match: 'Qarşılıqlı hərəkət yoluna çıxış' },
  '5.38': { match: 'Küçənin istiqaməti' },
  '5.39': { match: 'Kəsişmə yoluna xəbərdaredici və ya qadağanedici nişanlar' },
  '6.1':  { match: 'İlk tibbi yardım məntəqəsi' },
  '6.2':  { match: 'Xəstəxana' },
  '6.3':  { match: 'Yanacaqdoldurma məntəqəsi' },
  '6.4':  { match: 'Avtomobillərə texniki xidmət' },
  '6.5':  { match: 'Avtomobillərin yuyulma məntəqəsi' },
  '6.6':  { match: 'Telefon' },
  '6.7':  { match: 'Yeməkxana' },
  '6.8':  { match: 'İçməli su' },
  '6.9':  { match: 'Mehmanxana və ya motel' },
  '6.10': { match: 'Kempinq' },
  '6.11': { match: 'Dincəlmə yeri' },
  '6.12': { match: 'Yol polisinin daimi məntəqəsi' },
  '6.13': { match: 'Polis hissəsi' },
  '6.14': { match: 'İnformasiya stendi' },
  '6.15': { match: 'Tualet' },
  '6.16': { match: 'Çimərlik' },
};

export const COURSE = {
  title: 'Yol Nişanları — hekayələrlə öyrən',
  description: 'Bütün yol nişanları bir kursda: hər nişan gündəlik səhnələrin içində hekayə formasında izah olunur, hər dərsdə nişan şəkilləri və test var.',
  isFree: false,
};

export const LESSONS = [
  {
    title: 'Yol nişanlarının dili — giriş',
    codes: ['5.22', '5.23', '1.20', '3.24', '2.1', '6.3'],
    content: `## Səhər şəhərdən çıxış

Səhər saatlarında işə yollanırsan. Küçənin sonunda ağ fonda adı yazılmış düzbucaqlı nişan görünür — yaşayış məntəqəsi başlayır və buradan etibarən şəhərdəki hərəkət qaydaları qüvvəyə minir.

![nisan:5.22]

Məntəqənin sonunda isə həmin nişanın üstündən xətt çəkilmiş variantı dayanır — qaydaların qüvvəsi bitir.

![nisan:5.23]

Yol boyu irəliləyirsən. Yolun üstündən ağ zolaqlar çəkilmiş üçbucaqlı nişan sənə deyir: qarşıda piyada keçidi var, yavaşla və diqqətli ol.

![nisan:1.20]

Dairəvi ağ nişanın içində qara rəqəm görünür — bu, maksimum sürət həddidir. Nişanda göstərilən həddən artıq sürətlə hərəkət etmək qadağandır.

![nisan:3.24]

Yolayrıcına yaxınlaşanda sarı romb formalı nişan diqqətini çəkir: baş yoldasan, nizamlanmayan yolayrıcında üstünlük sənə məxsusdur.

![nisan:2.1]

Uzun yola çıxacaqsansa, yanacağın bitəcəyi narahatlığı yoxdur: mavi düzbucaqlı nişan yanacaqdoldurma məntəqəsinin yerini göstərir.

![nisan:6.3]

### Nişanların dili

Hər nişan öz forması və rəngi ilə bir "cümlə" deyir: üçbucaq xəbərdarlıq edir, dairə qadağa qoyur və ya məcbur edir, düzbucaqlı məlumat verir. Bu kursda hər ailəni ayrıca, gündəlik səhnələrin içində öyrənəcəksən.

> **Diqqət:** Nişan gördükdə ilk növbədə onu anlamağa çalış, sonra hərəkəti ona uyğun qur. Yol nişanları təsadüfən qoyulmur — hər biri bir təhlükəni, qaydanı və ya xidməti bildirir.

## Yekun

- Ağ fonlu məntəqə nişanı şəhər qaydalarının başlanğıcını, üstündən xətt çəkilmişi isə sonunu göstərir.
- Üçbucaqlı nişanlar qarşıdakı təhlükə barədə xəbərdarlıq edir.
- Dairəvi nişanlar məhdudiyyət və ya məcburiyyət qoyur.
- Düzbucaqlı nişanlar istiqamət, məsafə və xidmət barədə məlumat verir.
- Səfərin hər mərhələsində nişanlar səninlə "danışır" — sadəcə onları oxumağı bil.`,
    questions: [
      { q: 'Ağ fonda adı yazılmış düzbucaqlı nişan nəyi bildirir?', options: ['Yaşayış məntəqəsinin başlanğıcını', 'Yolun sonunu', 'Maksimum sürəti', 'Dayanacaq yerini'], correct: 0, explanation: 'Ağ fonlu məntəqə nişanı yaşayış məntəqəsinin başlanğıcını göstərir.' },
      { q: 'Üstündən xətt çəkilmiş məntəqə nişanı nəyi bildirir?', options: ['Yaşayış məntəqəsinin qurtaracağını', 'Sürət həddinin başlanğıcını', 'Yol işlərini', 'Piyada keçidini'], correct: 0, explanation: 'Üstündən xətt çəkilmiş məntəqə nişanı yaşayış məntəqəsinin qurtaracağını göstərir.' },
      { q: 'Üçbucaqlı nişanlar əsasən nə üçün istifadə olunur?', options: ['Qarşıdakı təhlükə barədə xəbərdarlıq etmək üçün', 'Sürət həddi qoymaq üçün', 'Dayanmağı qadağan etmək üçün', 'Xidmət obyektlərini göstərmək üçün'], correct: 0, explanation: 'Üçbucaqlı nişanlar qarşıdakı təhlükə barədə sürücünü xəbərdar edir.' },
      { q: 'Dairəvi nişanın içində qara rəqəm (məsələn 50) nəyi bildirir?', options: ['Maksimum sürət həddini', 'Məsafəni', 'Yolun nömrəsini', 'Dayanacağın nömrəsini'], correct: 0, explanation: 'Dairəvi nişandakı rəqəm maksimum sürət həddini göstərir — ondan artıq sürətlə hərəkət qadağandır.' },
      { q: 'Sarı romb formalı nişan nəyi bildirir?', options: ['Baş yolu — üstünlük verilən yolu', 'Yol işlərini', 'Tuneli', 'Piyada keçidini'], correct: 0, explanation: 'Sarı romb formalı nişan baş yolu göstərir; nizamlanmayan yolayrıcında bu yolda üstünlük var.' },
      { q: 'Mavi düzbucaqlı nişanın üstündə yanacaq nasosu təsviri nəyi bildirir?', options: ['Yanacaqdoldurma məntəqəsini', 'Avtomobil yuma məntəqəsini', 'Dincəlmə yerini', 'Texniki xidmət məntəqəsini'], correct: 0, explanation: 'Bu, yanacaqdoldurma məntəqəsinin yerləşdiyi yeri göstərən servis nişanıdır.' },
      { q: 'Yaşayış məntəqəsi qaydaları hansı nişandan etibarən qüvvəyə minir?', options: ['Ağ fonlu məntəqə başlanğıcı nişanından', 'Mavi fondakı istiqamət nişanından', 'Sarı romb nişanından', 'Üçbucaqlı nişandan'], correct: 0, explanation: 'Ağ fonlu məntəqə başlanğıcı nişanından etibarən yaşayış məntəqəsi qaydaları tətbiq olunur.' },
      { q: 'Piyada keçidi qarşıda olduğunu hansı nişan bildirir?', options: ['Yolun üstündən ağ zolaqlar çəkilmiş üçbucaqlı nişan', 'Dairəvi mavi nişan', 'Sarı romb nişanı', 'Ağ fonlu düzbucaqlı nişan'], correct: 0, explanation: 'Piyada keçidi xəbərdarlıq nişanı üçbucaqlıdır və üzərində ağ zolaqlar təsvir olunur.' },
      { q: 'Maksimum sürət həddi nişanı hansı formada olur?', options: ['Dairəvi', 'Üçbucaqlı', 'Romb', 'Düzbucaqlı'], correct: 0, explanation: 'Sürət məhdudiyyəti qadağanedici dairəvi nişandır.' },
      { q: 'Baş yol nişanı hansı formadadır?', options: ['Sarı romb', 'Qırmızı dairə', 'Mavi düzbucaqlı', 'Üçbucaq'], correct: 0, explanation: 'Baş yol nişanı sarı romb formasındadır.' },
      { q: 'Üstündən xətt çəkilmiş 5.22 nişanı (5.23) nəyi bildirir?', options: ['Yaşayış məntəqəsinin qurtaracağını', 'Sürət həddinin artırılmasını', 'Yolun bağlanmasını', 'Xidmət obyektini'], correct: 0, explanation: '5.23 nişanı yaşayış məntəqəsinin qurtaracağını bildirir.' },
      { q: 'Nişanlar sürücüyə ilk növbədə nə verir?', options: ['Məlumat — təhlükə, qayda və ya xidmət barədə', 'Yanacaq qənaəti barədə', 'Cərimə barədə', 'Məşq barədə'], correct: 0, explanation: 'Nişanlar qarşıdakı təhlükə, qayda və ya xidmət obyekti barədə məlumat verir.' },
      { q: 'Hansı nişan yaşayış məntəqəsinin başlanğıcını göstərir?', options: ['5.22', '2.1', '3.24', '1.20'], correct: 0, explanation: '5.22 nişanı yaşayış məntəqəsinin başlanğıcını göstərir.' },
      { q: 'Yanacaqdoldurma məntəqəsi hansı nömrəli servis nişanı ilə göstərilir?', options: ['6.3', '6.1', '6.11', '6.5'], correct: 0, explanation: '6.3 nişanı yanacaqdoldurma məntəqəsini göstərir.' },
      { q: 'Hansı nişan "baş yol" mənasını verir?', options: ['2.1', '2.5', '3.1', '5.1'], correct: 0, explanation: '2.1 nişanı baş yolu — nizamlanmayan yolayrıclarında üstünlük verilən yolu göstərir.' },
    ],
  },
  {
    title: 'Xəbərdarlıq nişanları: dağ yolunda səfər',
    codes: ['1.13', '1.14', '1.15', '1.16', '1.17', '1.27', '1.26', '1.29'],
    content: `## Dağ yolunda səfər

Həftəsonu şəhərdən kənara çıxırsan. Yol dağlara doğru qalxmağa başlayır və üçbucaqlı nişanlar bir-birinin ardınca "danışır". Əvvəlcə aşağı meylli yola düşürsən — bu nişan sərt enişin başladığını bildirir.

![nisan:1.13]

Bir müddət sonra yol yenidən yuxarı qalxır — qarşıda sərt yoxuş var.

![nisan:1.14]

Yağışdan sonra yol təzəcə quruyub, bəzi hissələrdə su qalıb. Yol örtüyünün sürüşkən ola biləcəyi barədə xəbərdarlıq nişanı görürsən — sürəti azalt, qəfil əyləc və sükan hərəkətlərindən çəkin.

![nisan:1.15]

Daha irəlidə yol örtüyü pozulub, çuxurlar var — nahamar yol başlayır. Bu nişan sənə deyir ki, yavaş sür və asqını idarə et.

![nisan:1.16]

Yol kənarında çınqıl yığınları var. Bu nişan çınqıl sıçrayışı təhlükəsi barədə xəbərdarlıq edir — təkərlər altından daşlar sıçraya bilər.

![nisan:1.17]

Dağın aşırımına çatanda güclü yan külək əsir. Nişan yandan əsən külək barədə xəbərdarlıq edir — avtomobili yoldan çıxara biləcək qəfil külək partlayışlarına hazır ol.

![nisan:1.27]

Yolun bir hissəsi qayalıqların altından keçir. Daş uçqunu nişanı qarşıda daşların düşə biləcəyi sahə olduğunu bildirir — diqqətli ol və dayanacaq yerə yaxın sürmə.

![nisan:1.26]

Nəhayət, qarşıda tunel görünür. Tunel nişanı qarşıda tunel olduğunu xəbərdar edir — işıqları yandır, sürəti azalt və tunelə girməzdən əvvəl ətrafı yoxla.

![nisan:1.29]

### Niyə vacibdir

Xəbərdarlıq nişanları heç bir məhdudiyyət qoymur — onlar sadəcə qarşıdakı təhlükə barədə sürücünü xəbərdar edir. Bu nişanları gördükdə ilk növbədə diqqəti artırmaq və şəraitə uyğun sürət seçərək hərəkətin təhlükəsizliyini təmin etmək lazımdır.

> **Diqqət:** Sərt enişdə sürəti azaltmadan sürmək tormozların həddən artıq qızmasına və idarəetmənin itirilməsinə səbəb ola bilər. Yoxuşda isə öndəki nəqliyyat vasitəsinə lazım olan məsafəni saxla.

## Yekun

- Üçbucaqlı nişanlar xəbərdarlıq nişanlarıdır və məhdudiyyət qoymur.
- Sərt eniş və sərt yoxuş nişanları yolun meyilliyini bildirir.
- Sürüşkən və nahamar yol nişanları örtüyün vəziyyəti barədə xəbərdarlıq edir.
- Çınqıl sıçrayışı, daş uçqunu və yan külək nişanları təbiət təhlükələrini göstərir.
- Tunel nişanı qarşıda tunel olduğunu xəbərdar edir.`,
    questions: [
      { q: '1.13 nişanı nəyi bildirir?', options: ['Sərt enişi', 'Sərt yoxuşu', 'Tuneli', 'Nahamar yolu'], correct: 0, explanation: '1.13 nişanı sərt enişi bildirir.' },
      { q: 'Sərt yoxuş hansı nömrəli xəbərdarlıq nişanıdır?', options: ['1.14', '1.13', '1.16', '1.29'], correct: 0, explanation: '1.14 nişanı sərt yoxuşu bildirir.' },
      { q: 'Sürüşkən yol nişanı sürücüyə nə tövsiyə edir?', options: ['Sürəti azaltmağı və qəfil əyləcdən çəkinməyi', 'Sürəti artırmağı', 'Siqnal verməyi', 'Yolu dəyişməyi'], correct: 0, explanation: 'Sürüşkən yol nişanı qarşıda sürüşkən örtük olduğunu bildirir — sürəti azalt və qəfil hərəkətlərdən çəkin.' },
      { q: 'Xəbərdarlıq nişanları hansı məhdudiyyət qoyur?', options: ['Heç bir məhdudiyyət qoymur', 'Sürət həddi qoyur', 'Dayanmağı qadağan edir', 'Yalnız yük maşınlarına məhdudiyyət qoyur'], correct: 0, explanation: 'Xəbərdarlıq nişanları məhdudiyyət qoymur, sadəcə qarşıdakı təhlükə barədə xəbərdarlıq edir.' },
      { q: 'Çınqıl sıçrayışı nişanı (1.17) nəyi bildirir?', options: ['Təkərlər altından daşların sıçraya biləcəyini', 'Yolun bağlandığını', 'Dayanacaq yerini', 'Yanacaqdoldurma məntəqəsini'], correct: 0, explanation: '1.17 nişanı çınqıl sıçrayışı — yoldan daşların sıçraması təhlükəsi barədə xəbərdarlıq edir.' },
      { q: 'Yandan əsən külək nişanı hansı vəziyyətə hazırlıqlı olmağı tələb edir?', options: ['Qəfil külək partlayışlarına', 'Yağışa', 'Dumana', 'Günəşə'], correct: 0, explanation: '1.27 nişanı yandan əsən külək barədə xəbərdarlıq edir — qəfil külək avtomobili yoldan çıxara bilər.' },
      { q: 'Daş uçqunu nişanı (1.26) harada rast gəlinir?', options: ['Qayalıqların altından keçən yollarda', 'Şəhər küçələrində', 'Avtomagistrallarda', 'Dayanacaqlarda'], correct: 0, explanation: '1.26 nişanı qarşıda daşların düşə biləcəyi qayalıq sahə olduğunu bildirir.' },
      { q: 'Tunel nişanı (1.29) görəndə nə etməliyən?', options: ['İşıqları yandırıb sürəti azaltmalısan', 'Sürəti artırmalısan', 'Dərhal dayanmalısan', 'Siqnal çalmalısan'], correct: 0, explanation: 'Tunelə girməzdən əvvəl işıqları yandırmaq və sürəti azaltmaq təhlükəsizlik üçün vacibdir.' },
      { q: 'Nahamar yol nişanı (1.16) nəyi göstərir?', options: ['Yol örtüyünün pozulduğunu', 'Yolun düz olduğunu', 'Yolun genişləndiyini', 'Piyada keçidini'], correct: 0, explanation: '1.16 nişanı qarşıda nahamar (pozulmuş) yol örtüyü olduğunu bildirir.' },
      { q: 'Sərt enişdə hansı risk yaranır?', options: ['Tormozların həddən artıq qızması', 'Yanacağın bitməsi', 'Akumulyatorun boşalması', 'Şinlərin partlaması'], correct: 0, explanation: 'Sərt enişdə sürət azaldılmazsa tormozlar qıza bilər və idarəetmə itirilə bilər.' },
      { q: 'Hansı nişan sürüşkən yolu bildirir?', options: ['1.15', '1.13', '1.27', '1.30'], correct: 0, explanation: '1.15 nişanı sürüşkən yolu bildirir.' },
      { q: '1.29 nişanı nəyi bildirir?', options: ['Tuneli', 'Körpünü', 'Dairəvi hərəkəti', 'Yol işlərini'], correct: 0, explanation: '1.29 nişanı qarşıda tunel olduğunu bildirir.' },
      { q: 'Daş uçqunu təhlükəsi olan yolda necə davranmalısan?', options: ['Diqqətli olub, dayanacaq yerə yaxın sürməlisən', 'Sürəti maksimuma çatdırmalısan', 'Daim siqnal çalmalısan', 'Yolu tərk etməlisən'], correct: 0, explanation: 'Daş uçqunu sahəsində diqqətli olmaq və dayanmaq üçün təhlükəli yerə yaxın sürməmək lazımdır.' },
      { q: 'Xəbərdarlıq nişanı görəndə ilk növbədə nə etməliyən?', options: ['Diqqəti artırıb şəraitə uyğun sürət seçməlisən', 'Dərhal dayanmalısan', 'Sürəti artırmalısan', 'Ətrafa siqnal verməlisən'], correct: 0, explanation: 'Xəbərdarlıq nişanları gördükdə diqqəti artırmaq və şəraitə uyğun sürət seçmək lazımdır.' },
      { q: '1.27 nişanı hansı təbiət hadisəsi barədə xəbərdarlıq edir?', options: ['Yandan əsən külək', 'Sel', 'Zəlzələ', 'Duman'], correct: 0, explanation: '1.27 nişanı yandan əsən külək barədə xəbərdarlıq edir.' },
    ],
  },
  {
    title: 'Xəbərdarlıq nişanları: uşaqlar və heyvanlar',
    codes: ['1.21', '1.22', '1.23', '1.24', '1.25', '1.28', '1.30'],
    content: `## Məktəbin yanından keçərkən

İş gününün ortasında məktəb rayonundan keçirsən. Yol kənarında iki uşaq təsviri olan üçbucaqlı nişan görürsən — bu, qarşıda uşaqların yola çıxa biləcəyi sahə olduğunu bildirir. Sürəti azalt və ən kiçik gözlənilməzliyə hazır ol.

![nisan:1.21]

Bir neçə metr irəlidə velosiped təsviri olan nişan diqqətini çəkir — qarşıda velosiped zolağı ilə kəsişmə var. Velosipedçilər yola gözlənilmədən çıxa bilər.

![nisan:1.22]

Daha sonra yolun bir hissəsi hasarlanıb, iş maşınları işləyir. Yol işləri nişanı qarşıda yolun təmir olunduğunu bildirir — işarələməyə və işçilərə diqqət et.

![nisan:1.23]

Şəhərdən çıxıb kənd yoluna düşəndə mal-qara keçidi nişanı görünür. Bu, yolda mal-qaranın keçə biləcəyi ərazi olduğunu bildirir.

![nisan:1.24]

Meşəyə yaxın hissədə isə vəhşi heyvanlar nişanı qoyulub — maral və ya digər heyvanlar yola çıxa bilər. Xüsusilə axşam və gecə saatlarında diqqətli ol.

![nisan:1.25]

Yol aeroporta yaxın keçir və alçaqdan uçan təyyarələr nişanı görünür — bu ərazidə təyyarələr alçaqdan uçur, səs-küy və gözlənilməz hallar ola bilər.

![nisan:1.28]

Yolun son hissəsində üzərində nida işarəsi olan nişan dayanır — bu, digər təhlükələr nişanıdır. Qarşıda bu siyahıda olmayan, lakin diqqət tələb edən bir təhlükə var.

![nisan:1.30]

### Niyə vacibdir

Uşaqlar və heyvanlar yol hərəkətində ən gözlənilməz iştirakçılardır. Onlar qaydaları bilmir və qəfil hərəkət edə bilərlər. Buna görə də bu nişanları görəndə sürəti azaltmaq və diqqəti maksimum artırmaq vacibdir.

> **Diqqət:** "Uşaqlar" nişanı yalnız məktəb yanında deyil, uşaq oyun meydançaları, uşaq bağçaları və digər uşaq fəaliyyəti olan yerlərdə də quraşdırılır.

## Yekun

- 1.21 nişanı qarşıda uşaqların ola biləcəyini bildirir.
- 1.22 nişanı velosiped zolağı ilə kəsişməni göstərir.
- 1.23 nişanı yol işləri barədə xəbərdarlıq edir.
- 1.24 və 1.25 nişanları mal-qara və vəhşi heyvanların keçidini bildirir.
- 1.28 alçaqdan uçan təyyarələri, 1.30 isə digər təhlükələri göstərir.`,
    questions: [
      { q: 'Üzərində iki uşaq təsviri olan üçbucaqlı nişan nəyi bildirir?', options: ['Qarşıda uşaqların yola çıxa biləcəyi sahəni', 'Uşaq bağçasını', 'Oyun meydançasını', 'Məktəb binasını'], correct: 0, explanation: '1.21 "Uşaqlar" nişanı qarşıda uşaqların yola çıxa biləcəyi sahəni bildirir.' },
      { q: 'Velosiped zolağı ilə kəsişmə hansı nişanla göstərilir?', options: ['1.22', '1.21', '1.23', '4.5'], correct: 0, explanation: '1.22 nişanı velosiped zolağı ilə kəsişməni bildirir.' },
      { q: 'Yol işləri nişanını görəndə necə davranmalısan?', options: ['İşarələməyə və işçilərə diqqət etməlisən', 'Sürəti artırmalısan', 'Dərhal geri qayıtmalısan', 'Siqnal çalmalısan'], correct: 0, explanation: '1.23 nişanı qarşıda yol təmiri olduğunu bildirir — işarələmə və işçilərə diqqət lazımdır.' },
      { q: 'Mal-qara keçidi nişanı (1.24) nəyi bildirir?', options: ['Yolda mal-qaranın keçə biləcəyi ərazini', 'Heyvandarlıq fermasını', 'Bazarı', 'Kəndi'], correct: 0, explanation: '1.24 nişanı yolda mal-qaranın keçə biləcəyi ərazini bildirir.' },
      { q: 'Vəhşi heyvanlar nişanı (1.25) ən çox harada rast gəlinir?', options: ['Meşəyə yaxın yollarda', 'Şəhər mərkəzində', 'Avtomagistrallarda', 'Dayanacaqlarda'], correct: 0, explanation: '1.25 nişanı meşəyə və ya vəhşi təbiətə yaxın yollarda qoyulur.' },
      { q: 'Alçaqdan uçan təyyarələr nişanı (1.28) harada olur?', options: ['Aeroport yaxınlığında', 'Dəmir yolu keçidində', 'Tuneldə', 'Körpüdə'], correct: 0, explanation: '1.28 nişanı aeroporta yaxın, təyyarələrin alçaqdan uçduğu ərazilərdə qoyulur.' },
      { q: 'Üzərində nida işarəsi olan üçbucaqlı nişan (1.30) nəyi bildirir?', options: ['Digər təhlükələri', 'Yol işlərini', 'Tuneli', 'Sürət həddini'], correct: 0, explanation: '1.30 nişanı bu siyahıda olmayan digər təhlükələri bildirir.' },
      { q: '"Uşaqlar" nişanı haralarda quraşdırılır?', options: ['Məktəb, bağça və oyun meydançaları yanında', 'Yalnız avtomagistralda', 'Yalnız tuneldə', 'Yalnız dayanacaqda'], correct: 0, explanation: '"Uşaqlar" nişanı uşaq fəaliyyəti olan yerlərdə — məktəb, bağça, oyun meydançası yanında qoyulur.' },
      { q: 'Velosipedçilər niyə gözlənilməz ola bilər?', options: ['Onlar yola qəfil çıxa bilər', 'Onlar sürəti ölçür', 'Onlar siqnal çalır', 'Onlar yolu bağlayır'], correct: 0, explanation: 'Velosiped zolağı ilə kəsişmədə velosipedçilər yola gözlənilmədən çıxa bilər.' },
      { q: 'Vəhşi heyvanlar nişanı görəndə nə vaxt xüsusilə diqqətli olmalısan?', options: ['Axşam və gecə saatlarında', 'Yalnız gündüz', 'Yalnız yayda', 'Yalnız yağışda'], correct: 0, explanation: 'Vəhşi heyvanlar ən çox axşam və gecə saatlarında aktiv olur.' },
      { q: '1.23 nişanı hansı vəziyyəti bildirir?', options: ['Yol işlərini', 'Yolun bağlanmasını', 'Piyada keçidini', 'Dairəvi hərəkəti'], correct: 0, explanation: '1.23 nişanı qarşıda yol işləri olduğunu bildirir.' },
      { q: 'Uşaqlar nişanı hansı formadadır?', options: ['Üçbucaqlı', 'Dairəvi', 'Romb', 'Düzbucaqlı'], correct: 0, explanation: '"Uşaqlar" nişanı digər xəbərdarlıq nişanları kimi üçbucaqlıdır.' },
      { q: '1.25 nişanı nəyi bildirir?', options: ['Vəhşi heyvanlar', 'Mal-qara', 'At-araba', 'Velosipedçilər'], correct: 0, explanation: '1.25 nişanı vəhşi heyvanların yola çıxa biləcəyini bildirir.' },
      { q: 'Yol işləri sahəsində hansı təhlükə var?', options: ['İş maşınları və işçilər hərəkət edir', 'Yol çox genişdir', 'İşıqlar sönür', 'Heyvanlar keçir'], correct: 0, explanation: 'Yol işləri sahəsində iş maşınları və işçilər hərəkətdə olur — diqqət tələb olunur.' },
      { q: '1.30 nişanının üzərində hansı işarə var?', options: ['Nida işarəsi', 'Sual işarəsi', 'Xaç', 'Ox'], correct: 0, explanation: '1.30 "Digər təhlükələr" nişanının üzərində nida işarəsi təsvir olunur.' },
    ],
  },
  {
    title: 'Xəbərdarlıq nişanları: yollar və kəsişmələr',
    codes: ['1.2', '1.5', '1.6', '1.7', '1.8', '1.9', '1.10', '1.19'],
    content: `## Şəhərdən çıxarkən

Səhər tezdən şəhərdən çıxırsan və yol dəmir yolu xəttinə yaxınlaşır. Şlaqbaumsuz dəmir yol keçidi nişanı görünür — bu keçiddə maneə (şlaqbaum) yoxdur, ona görə də keçidə yaxınlaşarkən qatarın gəlib-gəlmədiyini özün yoxlamalısan.

![nisan:1.2]

Şəhərə qayıdarkən tramvay xətti ilə kəsişən küçədən keçirsən. Tramvay xətti ilə kəsişmə nişanı sənə deyir: qarşıda tramvay yolu ilə kəsişmə var, tramvaya yol ver.

![nisan:1.5]

Yolayrıcına yaxınlaşırsan — eyni əhəmiyyətli yolların kəsişməsi nişanı qoyulub. Bu o deməkdir ki, yolayrıcı nizamlanmır və sağdan gələn nəqliyyat vasitəsinə diqqət etməlisən.

![nisan:1.6]

Bir az irəlidə dairəvi hərəkətlə kəsişmə nişanı görünür — qarşıda dairəvi hərəkət (dairə) olan yolayrıcı var.

![nisan:1.7]

Şəhər mərkəzində svetoforla nizamlama nişanı diqqətini çəkir — qarşıda svetoforla idarə olunan yolayrıcı var, svetoforun siqnallarına bax.

![nisan:1.8]

Çayın üstündən keçən körpüyə yaxınlaşırsan — ayrılan körpü nişanı qoyulub. Bu, körpünün ayrıla (qalxa) bildiyini bildirir; körpü açıqdırsa, dayanıb gözləməliyik.

![nisan:1.9]

Sahil boyu gedən yolda sahilboyuna çıxış nişanı görünür — yolun kənarı suya yaxındır, diqqətli ol, sürəti azalt.

![nisan:1.10]

Yolun dar hissəsində əks istiqamətdən gələn avtomobillər görürsən — ikitərəfli hərəkət nişanı qoyulub. Bu, qarşıda hər iki istiqamətdə hərəkətin olduğunu bildirir.

![nisan:1.19]

### Niyə vacibdir

Bu nişanlar yolun quruluşundakı xüsusi vəziyyətləri — dəmir yolu keçidi, körpü, sahil, svetofor və kəsişmə növlərini bildirir. Onları görəndə yolun quruluşuna uyğun davranmaq, lazım gəldikdə sürəti azaltmaq və diqqəti artırmaq vacibdir.

> **Diqqət:** Şlaqbaumsuz dəmir yol keçidində heç bir maneə yoxdur — qatarın gəlib-gəlmədiyini yalnız sən yoxlaya bilərsən. Keçidə yalnız bundan sonra daxil ol.

## Yekun

- 1.2 nişanı şlaqbaumsuz dəmir yol keçidini bildirir.
- 1.5 tramvay xətti ilə kəsişməni, 1.6 eyni əhəmiyyətli yolların kəsişməsini göstərir.
- 1.7 dairəvi hərəkətlə kəsişməni, 1.8 svetoforla nizamlamanı bildirir.
- 1.9 ayrılan körpünü, 1.10 sahilboyuna çıxışı göstərir.
- 1.19 ikitərəfli hərəkəti bildirir.`,
    questions: [
      { q: 'Şlaqbaumsuz dəmir yol keçidi nişanını görəndə nə etməlisən?', options: ['Qatarın gəlib-gəlmədiyini özün yoxlamalısan', 'Dərhal keçidi keçməlisən', 'Siqnal çalmalısan', 'Geri qayıtmalısan'], correct: 0, explanation: 'Şlaqbaumsuz keçiddə maneə yoxdur — qatarın gəlib-gəlmədiyini sürücü özü yoxlamalıdır.' },
      { q: '1.5 nişanı nəyi bildirir?', options: ['Tramvay xətti ilə kəsişməni', 'Avtobus dayanacağını', 'Dəmir yolu keçidini', 'Metro stansiyasını'], correct: 0, explanation: '1.5 nişanı tramvay xətti ilə kəsişməni bildirir.' },
      { q: 'Eyni əhəmiyyətli yolların kəsişməsi nişanı (1.6) nəyi bildirir?', options: ['Nizamlanmayan yolayrıcını', 'Svetoforlu yolayrıcını', 'Dairəvi hərəkəti', 'Baş yolu'], correct: 0, explanation: '1.6 nişanı eyni əhəmiyyətli yolların (nizamlanmayan) kəsişməsini bildirir.' },
      { q: '1.7 nişanı nəyi bildirir?', options: ['Dairəvi hərəkətlə kəsişməni', 'Tuneli', 'Körpünü', 'Piyada keçidini'], correct: 0, explanation: '1.7 nişanı dairəvi hərəkətlə kəsişməni bildirir.' },
      { q: 'Svetoforla nizamlama nişanı (1.8) görəndə nəyə baxmalısan?', options: ['Svetoforun siqnallarına', 'Yalnız yol nişanlarına', 'Yalnız piyadalara', 'Heç nəyə'], correct: 0, explanation: '1.8 nişanı qarşıda svetoforla idarə olunan yolayrıcı olduğunu bildirir — svetoforun siqnallarına bax.' },
      { q: 'Ayrılan körpü nişanı (1.9) nəyi bildirir?', options: ['Körpünün ayrıla bildiyini', 'Körpünün bağlandığını', 'Körpünün təmir olunduğunu', 'Körpünün genişləndiyini'], correct: 0, explanation: '1.9 nişanı qarşıda ayrılan (qalxa bilən) körpü olduğunu bildirir.' },
      { q: 'Sahilboyuna çıxış nişanı (1.10) hansı təhlükə barədə xəbərdarlıq edir?', options: ['Yolun kənarının suya yaxın olduğunu', 'Yolun daraldığını', 'Yolun bağlandığını', 'Duman olduğunu'], correct: 0, explanation: '1.10 nişanı yolun sahilə çıxdığını — kənarın suya yaxın olduğunu bildirir.' },
      { q: 'İkitərəfli hərəkət nişanı (1.19) nəyi bildirir?', options: ['Qarşıda hər iki istiqamətdə hərəkətin olduğunu', 'Yolun birtərəfli olduğunu', 'Yolun bağlandığını', 'Dairəvi hərəkəti'], correct: 0, explanation: '1.19 nişanı qarşıda hər iki istiqamətdə hərəkətin olduğunu bildirir.' },
      { q: 'Tramvay xətti ilə kəsişmədə kimə yol verməlisən?', options: ['Tramvaya', 'Velosipedçiyə', 'Yük maşınına', 'Heç kimə'], correct: 0, explanation: 'Tramvay xətti ilə kəsişmədə tramvaya yol vermək lazımdır.' },
      { q: '1.6 nişanını görəndə hansı istiqamətə xüsusi diqqət etməlisən?', options: ['Sağdan gələn nəqliyyata', 'Yalnız sola', 'Yalnız geriyə', 'Yalnız yuxarıya'], correct: 0, explanation: 'Eyni əhəmiyyətli yolların kəsişməsində sağdan gələn nəqliyyat vasitəsinə diqqət etmək lazımdır.' },
      { q: '1.2 nişanı hansı dəmir yolu keçidini bildirir?', options: ['Şlaqbaumsuz (maneəsiz)', 'Şlaqbaumlu', 'Yeraltı', 'Hər ikisini'], correct: 0, explanation: '1.2 nişanı şlaqbaumsuz dəmir yol keçidini bildirir.' },
      { q: 'Dairəvi hərəkətlə kəsişmə nişanını görəndə nəyə hazır olmalısan?', options: ['Dairəyə (dairəvi hərəkətə) daxil olmağa', 'Körpüdən keçməyə', 'Tunelə girməyə', 'Sahilə çıxmağa'], correct: 0, explanation: '1.7 nişanı qarşıda dairəvi hərəkət olan yolayrıcı olduğunu bildirir.' },
      { q: 'Ayrılan körpü açıqdırsa nə etməlisən?', options: ['Dayanıb gözləməlisən', 'Dərhal keçməlisən', 'Geri dönməlisən', 'Siqnal çalmalısan'], correct: 0, explanation: 'Ayrılan körpü açıq (qalxmış) vəziyyətdədirsə, dayanıb gözləmək lazımdır.' },
      { q: '1.19 nişanı olan yolda hansı vəziyyət var?', options: ['Hər iki istiqamətdən avtomobillər gəlir', 'Yol bağlıdır', 'Yol birtərəflidir', 'Piyadalar üstündür'], correct: 0, explanation: '1.19 ikitərəfli hərəkət nişanıdır — hər iki istiqamətdən nəqliyyat hərəkət edir.' },
      { q: '1.8 nişanı harada quraşdırılır?', options: ['Svetoforla idarə olunan yolayrıcından əvvəl', 'Tuneldə', 'Dayanacaqda', 'Körpüdə'], correct: 0, explanation: '1.8 nişanı svetoforla nizamlanan yolayrıcına yaxınlaşarkən qoyulur.' },
    ],
  },


  {
    title: 'Üstünlük nişanları: yolayrıcında kim birinci',
    codes: ['2.1', '2.2', '2.4', '2.5', '2.6', '2.7'],
    content: `## Yolayrıcında kim birinci

Şəhər kənarında yolayrıcına yaxınlaşırsan. Yolun üzərində sarı romb formalı nişan — baş yol nişanı dayanır. Sən baş yoldasan və nizamlanmayan yolayrıcını keçməkdə üstünlük sənə məxsusdur.

![nisan:2.1]

Bir neçə kilometr sonra həmin nişanın üstündən xətt çəkilmiş variantı görünür — baş yolun sonu gəlir, üstünlük bitir.

![nisan:2.2]

Yan yoldan çıxmaq istəyirsən. Kəsişmədə üçbucaqlı "Yol ver" nişanı qoyulub — əsas yolda hərəkət edən nəqliyyat vasitələrinə yol verməlisən.

![nisan:2.4]

Başqa bir yolayrıcında isə səkkizbucaqlı "STOP" nişanı diqqətini çəkir. Dayanmadan keçmək qadağandır: stop-xətt qarşısında, bu xətt olmadıqda isə hərəkət hissələrinin kəsişmə xətti qarşısında tam dayanmalısan.

![nisan:2.5]

Dar bir körpüyə yaxınlaşırsan. Körpüdən əvvəl qarşıdan hərəkətin üstünlüyü nişanı var: əgər qarşıdan gələn nəqliyyat vasitəsinin hərəkəti üçün maneə yaradılacaqsa, yolun daralmış sahəsinə girmək qadağandır. Qarşı tərəfdən gələnə yol verməlisən.

![nisan:2.6]

Elə daralma yerləri də var ki, üstünlük sənin tərəfindədir — qarşıdan hərəkətə nisbətən üstünlük nişanı. Bu nişanın qüvvədə olduğu daralmış sahədə hərəkət edərkən sən qarşıdan gələn nəqliyyat vasitəsi qarşısında üstünlüyə maliksən.

![nisan:2.7]

### Niyə vacibdir

Üstünlük nişanları yolayrıcında və daralmış sahələrdə kimin birinci keçəcəyini müəyyən edir. Bu qaydalar olmasa, hər kəs "mən birinci" deyəcək və nəqliyyat dayanacaq — ya da daha pisi, toqquşma baş verəcək.

> **Diqqət:** "Yol ver" və "STOP" nişanları arasında fərq var: yol ver nişanında lazım gəldikdə dayanmaq kifayətdir, STOP nişanında isə həmişə tam dayanmaq mütləqdir.

## Yekun

- 2.1 baş yolu, 2.2 baş yolun sonunu bildirir.
- 2.4 "Yol ver", 2.5 "Dayanmadan keçmək qadağandır" nişanıdır.
- 2.6 qarşıdan hərəkətin üstünlüyü, 2.7 isə qarşıdan hərəkətə nisbətən üstünlükdür.
- STOP nişanında tam dayanmaq mütləqdir, "Yol ver"də isə lazım gəldikdə.`,
    questions: [
      { q: '2.1 nişanı nəyi bildirir?', options: ['Baş yolu — üstünlük verilən yolu', 'Baş yolun sonunu', 'Yol verməyi', 'Dayanmağı'], correct: 0, explanation: '2.1 nişanı baş yolu bildirir — nizamlanmayan yolayrıclarını keçməkdə üstünlük verilən yol.' },
      { q: '2.2 nişanı nəyi bildirir?', options: ['Baş yolun sonunu', 'Baş yolu', 'Yol işlərini', 'Piyada keçidini'], correct: 0, explanation: '2.2 nişanı baş yolun sonunu bildirir.' },
      { q: '2.4 nişanı nəyi bildirir?', options: ['Yol ver', 'Dayanmadan keçmək qadağandır', 'Baş yol', 'İkitərəfli hərəkət'], correct: 0, explanation: '2.4 nişanı "Yol ver" nişanıdır.' },
      { q: '2.5 nişanı nəyi bildirir?', options: ['Dayanmadan keçmək qadağandır (STOP)', 'Yol ver', 'Sürət həddi', 'Baş yol'], correct: 0, explanation: '2.5 nişanı dayanmadan keçməyin qadağan olduğunu bildirir.' },
      { q: 'STOP nişanı (2.5) olan yerdə nə etməlisən?', options: ['Stop-xətt qarşısında tam dayanmalısan', 'Yavaşlayıb keçməlisən', 'Yalnız siqnal çalmalısan', 'Sürəti artırmalısan'], correct: 0, explanation: '2.5 nişanı stop-xətt qarşısında, olmadıqda hərəkət hissələrinin kəsişmə xətti qarşısında tam dayanmağı tələb edir.' },
      { q: '2.6 nişanı nəyi bildirir?', options: ['Qarşıdan hərəkətin üstünlüyü', 'Qarşıdan hərəkətə nisbətən üstünlük', 'Baş yol', 'Yol ver'], correct: 0, explanation: '2.6 nişanı qarşıdan hərəkətin üstünlüyünü bildirir — qarşıdan gələnə yol verilməlidir.' },
      { q: '2.7 nişanı nəyi bildirir?', options: ['Qarşıdan hərəkətə nisbətən üstünlük', 'Qarşıdan hərəkətin üstünlüyü', 'Baş yolun sonu', 'Dayanmaq qadağandır'], correct: 0, explanation: '2.7 nişanı daralmış sahədə sürücünün qarşıdan gələn nəqliyyat qarşısında üstünlüyünü bildirir.' },
      { q: '"Yol ver" nişanı (2.4) ilə "STOP" nişanı (2.5) arasındakı əsas fərq nədir?', options: ['STOP-da həmişə tam dayanmaq lazımdır, Yol verdə lazım gəldikdə', 'Yol verdə dayanmaq qadağandır', 'STOP yalnız dəmir yolu keçidindədir', 'Fərq yoxdur'], correct: 0, explanation: 'STOP nişanı tam dayanmağı tələb edir, "Yol ver" nişanında isə lazım gəldikdə dayanmaq kifayətdir.' },
      { q: 'Baş yolda hərəkət edərkən hansı üstünlüyə maliksən?', options: ['Nizamlanmayan yolayrıcını keçməkdə', 'Yalnız piyadalar üzərində', 'Yalnız gecə saatlarında', 'Heç bir üstünlüyə'], correct: 0, explanation: 'Baş yol nişanı (2.1) nizamlanmayan yolayrıclarını keçməkdə üstünlük verir.' },
      { q: '2.6 nişanının qüvvədə olduğu daralmış sahədə nə etməlisən?', options: ['Qarşıdan gələnə yol verməlisən', 'Birinci sən keçməlisən', 'Daim siqnal çalmalısan', 'Geri dönməlisən'], correct: 0, explanation: '2.6 nişanı qarşıdan gələn nəqliyyat vasitəsinə yol verməyi tələb edir.' },
      { q: '2.7 nişanının qüvvədə olduğu daralmış sahədə kim üstündür?', options: ['Sən — qarşıdan gələnə nisbətən', 'Qarşıdan gələn', 'Piyadalar', 'Heç kim'], correct: 0, explanation: '2.7 nişanı daralmış sahədə hərəkət edərkən qarşıdan gələn nəqliyyat qarşısında sürücüyə üstünlük verir.' },
      { q: 'Baş yolun sonu nişanını (2.2) görəndə nə baş verir?', options: ['Üstünlük bitir, qarşıdakı yolayrıcında üstünlük qaydaları tətbiq olunur', 'Yol bağlanır', 'Sürət həddi qalxır', 'Yol birtərəfli olur'], correct: 0, explanation: '2.2 nişanı baş yolun sonunu bildirir — üstünlük qüvvədən düşür.' },
      { q: '2.5 nişanı hansı formadadır?', options: ['Səkkizbucaqlı', 'Üçbucaqlı', 'Dairəvi', 'Romb'], correct: 0, explanation: '2.5 "Dayanmadan keçmək qadağandır" nişanı səkkizbucaqlı formadadır.' },
      { q: '2.4 nişanı hansı formadadır?', options: ['Üçbucaqlı', 'Dairəvi', 'Romb', 'Düzbucaqlı'], correct: 0, explanation: '2.4 "Yol ver" nişanı üçbucaqlı formadadır.' },
      { q: 'Üstünlük nişanları nəyi müəyyən edir?', options: ['Yolayrıcında və daralmış sahələrdə kimin birinci keçəcəyini', 'Yalnız sürət həddini', 'Yalnız dayanacaq yerini', 'Yalnız piyada keçidlərini'], correct: 0, explanation: 'Üstünlük nişanları yolayrıcında və daralmış sahələrdə keçid üstünlüyünü müəyyən edir.' },
    ],
  },
  {
    title: 'Qadağanedici nişanlar: giriş və hərəkət qadağaları',
    codes: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8', '3.9', '3.10'],
    content: `## Şəhərin məhəllə küçələrində

Yük maşını ilə şəhərə daxil olursan və qadağanedici nişanların "ordusu" ilə qarşılaşırsan. Əvvəlcə qırmızı dairə içində ağ düzbucaqlı nişan — giriş qadağandır nişanı. Bu nişan yalnız qoyulduğu istiqamətdə hərəkəti qadağan edir; qarşı tərəfdən hərəkət var.

![nisan:3.1]

Bir sonrakı küçədə tamamilə ağ dairəli nişan — hərəkət qadağandır. Bu, bütün nəqliyyat vasitələrinin hərəkətinin qadağan olduğunu bildirir.

![nisan:3.2]

Daha irəlidə minik avtomobili təsviri olan nişan — mexaniki nəqliyyat vasitələrinin hərəkəti qadağandır. Sən yük maşını ilə gəldiyin üçün bu küçəyə girməməlisən.

![nisan:3.3]

Yük maşını təsviri olan nişan isə yük avtomobillərinin hərəkətini qadağan edir. Bu qadağa icazə verilən maksimum kütləsi 3,5 tondan artıq olan yük avtomobillərinə, avtoqatarlara, traktorlara və özügedən maşınlara aiddir.

![nisan:3.4]

Motosiklet təsviri olan nişan motosikletlərin hərəkətini qadağan edir, traktor təsviri olan nişan isə traktorların və özügedən maşınların hərəkətini.

![nisan:3.5]

![nisan:3.6]

Qoşqu təsviri olan nişan — qoşqu ilə hərəkət qadağandır. Yük avtomobillərinin və traktorların qoşqu ilə hərəkəti qadağandır, lakin bu qadağa qoşqu ilə hərəkət edən minik avtomobillərinə şamil edilmir.

![nisan:3.7]

At-araba təsviri olan nişan at-arabalarının, kirşələrin, yük heyvanlarının hərəkətini və mal-qaranın ötürülməsini qadağan edir.

![nisan:3.8]

Velosiped təsviri olan nişan velosipedlərlə və mopedlərlə hərəkəti qadağan edir.

![nisan:3.9]

Sonda piyada təsviri olan nişan — piyadaların hərəkəti qadağandır.

![nisan:3.10]

### Niyə vacibdir

Qadağanedici nişanlar dairəvi formadadır və üzərindəki təsvirə uyğun hərəkəti qadağan edir. Bu nişanlar yolun müəyyən hissəsində hansı nəqliyyat növünün hərəkət edə bilməyəcəyini dəqiq müəyyən edir — təhlükəsizlik və yolun qorunması üçün.

> **Diqqət:** "Giriş qadağandır" (3.1) və "Hərəkət qadağandır" (3.2) nişanlarını qarışdırma: 3.1 yalnız bir istiqamətdə hərəkəti qadağan edir (qarşı tərəfdən hərəkət var), 3.2 isə bütün nəqliyyat vasitələrinin hərəkətini qadağan edir.

## Yekun

- 3.1 girişi, 3.2 bütün hərəkəti qadağan edir.
- 3.3-3.10 müxtəlif nəqliyyat növlərinin (mexaniki, yük, motosiklet, traktor, qoşqu, at-araba, velosiped, piyada) hərəkətini qadağan edir.
- Qoşqu qadağası minik avtomobillərinə şamil edilmir.
- 3.4 yük avtomobilləri üçün 3,5 t həddini nəzərdə tutur.`,
    questions: [
      { q: '3.1 nişanı nəyi bildirir?', options: ['Giriş qadağandır — yalnız qoyulduğu istiqamətdə', 'Bütün hərəkət qadağandır', 'Piyadaların hərəkəti qadağandır', 'Yol ver'], correct: 0, explanation: '3.1 nişanı girişi qadağan edir — yalnız qoyulduğu istiqamətdə hərəkət qadağandır.' },
      { q: '3.2 nişanı nəyi bildirir?', options: ['Bütün nəqliyyat vasitələrinin hərəkəti qadağandır', 'Yalnız yük maşınlarının hərəkəti qadağandır', 'Giriş qadağandır', 'Sürət həddi'], correct: 0, explanation: '3.2 nişanı bütün nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: '3.4 nişanı hansı nəqliyyat vasitələrinin hərəkətini qadağan edir?', options: ['Yük avtomobillərinin (3,5 t-dan artıq)', 'Velosipedlərin', 'Piyadaların', 'Tramvayların'], correct: 0, explanation: '3.4 nişanı icazə verilən maksimum kütləsi 3,5 t-dan artıq olan yük avtomobillərinin hərəkətini qadağan edir.' },
      { q: '3.7 nişanı nəyi bildirir?', options: ['Qoşqu ilə hərəkət qadağandır', 'Motosikletlərin hərəkəti qadağandır', 'At-araba ilə hərəkət qadağandır', 'Traktorların hərəkəti qadağandır'], correct: 0, explanation: '3.7 nişanı yük avtomobillərinin və traktorların qoşqu ilə hərəkətini qadağan edir.' },
      { q: 'Qoşqu ilə hərəkət qadağası hansı vasitəyə şamil edilmir?', options: ['Qoşqu ilə hərəkət edən minik avtomobillərinə', 'Yük avtomobillərinə', 'Traktorlara', 'Avtoqatarlara'], correct: 0, explanation: '3.7 nişanı qoşqu ilə hərəkət edən minik avtomobillərinin hərəkətini qadağan etmir.' },
      { q: '3.5 nişanı nəyi bildirir?', options: ['Motosikletlərin hərəkəti qadağandır', 'Velosipedlərlə hərəkət qadağandır', 'Mopedlərlə hərəkət qadağandır', 'Minik avtomobillərinin hərəkəti'], correct: 0, explanation: '3.5 nişanı motosikletlərin hərəkətini qadağan edir.' },
      { q: '3.6 nişanı nəyi bildirir?', options: ['Traktorların və özügedən maşınların hərəkəti qadağandır', 'Yük maşınlarının hərəkəti qadağandır', 'Qoşqu ilə hərəkət qadağandır', 'At-araba ilə hərəkət qadağandır'], correct: 0, explanation: '3.6 nişanı traktorların və özügedən maşınların hərəkətini qadağan edir.' },
      { q: '3.9 nişanı nəyi bildirir?', options: ['Velosipedlərlə və mopedlərlə hərəkət qadağandır', 'Piyadaların hərəkəti qadağandır', 'Velosiped zolağı', 'Məcburi istiqamət'], correct: 0, explanation: '3.9 nişanı velosipedlərlə və mopedlərlə hərəkəti qadağan edir.' },
      { q: '3.10 nişanı nəyi bildirir?', options: ['Piyadaların hərəkəti qadağandır', 'Velosipedlərin hərəkəti qadağandır', 'Dayanmaq qadağandır', 'Durmaq qadağandır'], correct: 0, explanation: '3.10 nişanı piyadaların hərəkətini qadağan edir.' },
      { q: '3.8 nişanı nəyi bildirir?', options: ['At-araba ilə hərəkət qadağandır', 'Mal-qara keçidi', 'Heyvanların hərəkəti', 'Vəhşi heyvanlar'], correct: 0, explanation: '3.8 nişanı at-arabalarının, kirşələrin, yük heyvanlarının hərəkətini və mal-qaranın ötürülməsini qadağan edir.' },
      { q: '3.1 nişanı ilə 3.2 nişanı arasındakı fərq nədir?', options: ['3.1 yalnız bir istiqaməti qadağan edir, 3.2 bütün hərəkəti', '3.1 sürəti, 3.2 dayanmanı qadağan edir', 'Fərq yoxdur', '3.1 yalnız piyadalar üçündür'], correct: 0, explanation: '3.1 yalnız qoyulduğu istiqamətdə hərəkəti qadağan edir, 3.2 isə bütün nəqliyyat vasitələrinin hərəkətini.' },
      { q: '3.3 nişanı nəyi bildirir?', options: ['Mexaniki nəqliyyat vasitələrinin hərəkəti qadağandır', 'Bütün hərəkət qadağandır', 'Giriş qadağandır', 'Velosipedlərin hərəkəti qadağandır'], correct: 0, explanation: '3.3 nişanı mexaniki nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: 'Yük avtomobillərinin hərəkəti qadağası hansı həddə əsaslanır?', options: ['İcazə verilən maksimum kütlə 3,5 t', 'Uzunluq 5 m', 'Sürət 40 km/saat', 'En 2 m'], correct: 0, explanation: '3.4 nişanı icazə verilən maksimum kütləsi 3,5 t-dan artıq olan yük avtomobillərinə aiddir.' },
      { q: 'Qadağanedici nişanlar hansı formadadır?', options: ['Dairəvi', 'Üçbucaqlı', 'Romb', 'Düzbucaqlı'], correct: 0, explanation: 'Qadağanedici nişanlar dairəvi formadadır.' },
      { q: '3.7 nişanını görəndə hansı vasitə ilə hərəkət edə bilərsən?', options: ['Qoşqusuz minik avtomobili ilə', 'Qoşqu ilə yük avtomobili ilə', 'Qoşqu ilə traktorla', 'Avtoqatar ilə'], correct: 0, explanation: '3.7 nişanı qoşqu ilə hərəkəti qadağan edir, lakin qoşqusuz hərəkət qadağan deyil.' },
    ],
  },
  {
    title: 'Qadağanedici nişanlar: ötmə, sürət və siqnal',
    codes: ['3.20', '3.21', '3.22', '3.23', '3.24', '3.25', '3.26', '3.19', '3.33'],
    content: `## Uzun yolda ötmə və sürət

İki zolaqlı yolda uzun səfərə çıxırsan. Qarşıda iki avtomobil təsviri olan qırmızı dairəli nişan — ötmək qadağandır. Bu nişanın qüvvədə olduğu ərazidə bütün nəqliyyat vasitələrinə ötmək qadağandır.

![nisan:3.20]

Bir neçə kilometr sonra həmin nişanın üstündən xətt çəkilmiş variantı — ötmənin qadağan edildiyi zonanın qurtaracağı görünür. Buradan etibarən şərait icazə verərsə, ötmək olar.

![nisan:3.21]

Yük maşını ilə gedirsənsə, qarşında yük maşını təsviri olan nişan — yük avtomobillərinin ötməsi qadağandır. İcazə verilən maksimum kütləsi 3,5 tondan artıq olan yük avtomobillərinə bütün nəqliyyat vasitələrini ötmək qadağandır.

![nisan:3.22]

Bu qadağanın da sonu var — yük avtomobillərinin ötməsi qadağan edilmiş zonanın qurtaracağı nişanı.

![nisan:3.23]

Yol düzənliyə çıxır və qırmızı dairə içində qara rəqəm olan nişan görünür — maksimum sürətin məhdudlaşdırılması. Nişanda göstərilən həddən artıq sürətlə hərəkət etmək qadağandır.

![nisan:3.24]

Sürət həddinin bitdiyini isə üstündən xətt çəkilmiş nişan bildirir — maksimum sürətin məhdudlaşdırıldığı zonanın qurtaracağı.

![nisan:3.25]

Şəhərə yaxınlaşanda isə klakson təsviri olan nişan — səs siqnalı vermək qadağandır. Yol-nəqliyyat hadisəsinin qarşısını almaq halları istisna olmaqla, bütün hallarda səs siqnalının verilməsi qadağandır.

![nisan:3.26]

Səhv küçəyə dönmüşdün — geriyə dönmək qadağandır nişanı qoyulub. Bu nişan geriyə dönməyi qadağan edir, lakin sola dönməyə icazə verilir.

![nisan:3.19]

Yolun sonunda isə bir neçə avtomobil təsviri olan nişan — nəqliyyat vasitələrinin kateqoriyalarına uyğun sürətin məhdudlaşdırılması. Müxtəlif kateqoriyalı nəqliyyat vasitələri üçün müxtəlif sürət hədləri təyin olunur.

![nisan:3.33]

### Niyə vacibdir

Ötmə və sürət qadağaları yol-nəqliyyat hadisələrinin ən çox baş verdiyi halları — təhlükəli ötməni və sürət həddinin aşılmasını məhdudlaşdırır. Səs siqnalı qadağası isə səs-küyü azaldır və siqnalın yalnız təhlükə zamanı istifadə olunmasını təmin edir.

> **Diqqət:** Səs siqnalı yalnız yol-nəqliyyat hadisəsinin qarşısını almaq üçün verilə bilər. Qalan bütün hallarda — hətta "salamlaşmaq" üçün belə — qadağandır.

## Yekun

- 3.20 ötməni qadağan edir, 3.21 qadağanın qurtaracağını bildirir.
- 3.22 yük avtomobillərinin ötməsini, 3.23 onun qurtaracağını göstərir.
- 3.24 maksimum sürəti məhdudlaşdırır, 3.25 zonanın qurtaracağını bildirir.
- 3.26 səs siqnalını qadağan edir, 3.19 geriyə dönməyi (sola dönməyə icazə ilə).
- 3.33 müxtəlif kateqoriyalar üçün sürət hədləri təyin edir.`,
    questions: [
      { q: '3.20 nişanı nəyi bildirir?', options: ['Bütün nəqliyyat vasitələrinə ötmək qadağandır', 'Yalnız yük maşınlarına ötmək qadağandır', 'Ötmə zonasının qurtaracağı', 'Sürət həddi'], correct: 0, explanation: '3.20 nişanı bütün nəqliyyat vasitələrinə ötməyi qadağan edir.' },
      { q: '3.21 nişanı nəyi bildirir?', options: ['Ötmənin qadağan edildiyi zonanın qurtaracağını', 'Ötmək qadağandır', 'Yük maşınlarının ötməsi qadağandır', 'Sürət həddinin qurtaracağını'], correct: 0, explanation: '3.21 nişanı ötməyin qadağan edildiyi zonanın qurtaracağını bildirir.' },
      { q: '3.22 nişanı hansı vasitələrin ötməsini qadağan edir?', options: ['3,5 t-dan artıq yük avtomobillərinin', 'Minik avtomobillərinin', 'Velosipedlərin', 'Piyadaların'], correct: 0, explanation: '3.22 nişanı icazə verilən maksimum kütləsi 3,5 t-dan artıq olan yük avtomobillərinə bütün nəqliyyat vasitələrini ötməyi qadağan edir.' },
      { q: '3.24 nişanı nəyi bildirir?', options: ['Maksimum sürətin məhdudlaşdırılmasını', 'Minimum sürəti', 'Tövsiyə edilən sürəti', 'Sürət zonasının qurtaracağını'], correct: 0, explanation: '3.24 nişanı nişanda göstərilən həddən artıq sürətlə hərəkəti qadağan edir.' },
      { q: '3.25 nişanı nəyi bildirir?', options: ['Maksimum sürətin məhdudlaşdırıldığı zonanın qurtaracağını', 'Sürət həddinin artırılmasını', 'Minimum sürəti', 'Yol işlərini'], correct: 0, explanation: '3.25 nişanı maksimum sürətin məhdudlaşdırıldığı zonanın qurtaracağını bildirir.' },
      { q: 'Səs siqnalı hansı halda verilə bilər?', options: ['Yol-nəqliyyat hadisəsinin qarşısını almaq üçün', 'Salamlaşmaq üçün', 'Sürəti artırmaq üçün', 'Piyadaları qorxutmaq üçün'], correct: 0, explanation: '3.26 nişanı səs siqnalını qadağan edir; istisna yalnız yol-nəqliyyat hadisəsinin qarşısını almaq hallarıdır.' },
      { q: '3.19 nişanı nəyi bildirir?', options: ['Geriyə dönmək qadağandır', 'Sola dönmək qadağandır', 'Sağa dönmək qadağandır', 'Dönmək qadağandır'], correct: 0, explanation: '3.19 nişanı geriyə dönməyi qadağan edir; sola dönməyə icazə verilir.' },
      { q: '3.33 nişanı nəyi bildirir?', options: ['Nəqliyyat vasitələrinin kateqoriyalarına uyğun sürətin məhdudlaşdırılması', 'Yalnız yük maşınları üçün sürət həddi', 'Sürət zonasının sonu', 'Tövsiyə edilən sürət'], correct: 0, explanation: '3.33 nişanı müxtəlif kateqoriyalı nəqliyyat vasitələri üçün fərqli sürət hədləri təyin edir.' },
      { q: 'Ötmə qadağası zonasının qurtaracağını hansı nişan bildirir?', options: ['3.21', '3.20', '3.22', '3.25'], correct: 0, explanation: '3.21 nişanı ötmənin qadağan edildiyi zonanın qurtaracağını bildirir.' },
      { q: '3.26 nişanının üzərində hansı təsvir var?', options: ['Klakson (səs siqnalı)', 'Avtomobil', 'Rəqəm', 'Ox'], correct: 0, explanation: '3.26 nişanının üzərində klakson təsviri var — səs siqnalı vermək qadağandır.' },
      { q: '3.24 nişanının üzərindəki rəqəm nəyi göstərir?', options: ['Maksimum sürət həddini (km/saat)', 'Məsafəni', 'Yolun nömrəsini', 'Saati'], correct: 0, explanation: '3.24 nişanındakı rəqəm km/saatla maksimum sürət həddini göstərir.' },
      { q: 'Yük avtomobillərinin ötməsi qadağan edilmiş zonanın qurtaracağı hansı nişandır?', options: ['3.23', '3.22', '3.21', '3.20'], correct: 0, explanation: '3.23 nişanı yük avtomobillərinin ötməsi qadağan edilmiş zonanın qurtaracağını bildirir.' },
      { q: '3.19 nişanının qüvvədə olduğu yerdə hansı manevrə icazə var?', options: ['Sola dönməyə', 'Geriyə dönməyə', 'U dönüşə', 'Heç bir manevrə'], correct: 0, explanation: '3.19 nişanı geriyə dönməyi qadağan edir, lakin sola dönməyə icazə verilir.' },
      { q: 'Sürət məhdudiyyəti zonasının sonunu necə bilirsən?', options: ['Üstündən xətt çəkilmiş sürət nişanından (3.25)', 'Svetofordan', 'Yol işlərindən', 'Piyada keçidindən'], correct: 0, explanation: '3.25 nişanı — üstündən xətt çəkilmiş maksimum sürət nişanı zonanın qurtaracağını bildirir.' },
      { q: 'Ötmə qadağası (3.20) hansı formadadır?', options: ['Dairəvi', 'Üçbucaqlı', 'Romb', 'Düzbucaqlı'], correct: 0, explanation: 'Ötmə qadağası qadağanedici dairəvi nişandır.' },
    ],
  },
  {
    title: 'Qadağanedici nişanlar: dayanma, durma və duracaqlar',
    codes: ['3.27', '3.28', '3.29', '3.30', '3.31', '3.32'],
    content: `## Şəhər mərkəzində parklanma axtarışı

Şəhər mərkəzində maşını saxlamaq üçün yer axtarırsan. İlk gördüyün nişan — iki mavi zolaqlı qırmızı dairə: dayanmaq qadağandır. Bu nişan nəqliyyat vasitələrinin dayanmasını və durmasını qadağan edir.

![nisan:3.27]

Bir sonrakı küçədə bir mavi zolaqlı nişan — durmaq qadağandır. Bu nişan yalnız durmağı qadağan edir, dayanmanı isə qadağan etmir. Yəni sərnişin mindirib-endirmək üçün qısa dayanmaq olar.

![nisan:3.28]

Yolun sol tərəfində isə "I" rəqəmi olan nişan — ayın tək günlərində durmaq qadağandır. Qarşı tərəfdə cüt günlər nişanı olmalıdır: tək günlərdə bir tərəfdə, cüt günlərdə digər tərəfdə durmaq olar.

![nisan:3.29]

![nisan:3.30]

Nəhayət, bir dairəvi ərazidən keçirsən — burada bütün məhdudiyyətlər zonasının qurtaracağı nişanı var. Eyni vaxtda bir neçə nişanın qüvvədə olduğu sahə bitir.

![nisan:3.31]

Yaxınlıqda əlil arabası təsviri olan nişan — ehtiyat üçün ayrılmış duracaq yeri. Bu yerə yalnız müvafiq icazəsi olan nəqliyyat vasitələri dura bilər.

![nisan:3.32]

### Niyə vacibdir

Dayanma və durma qadağaları şəhər küçələrində hərəkətin sərbəst axmasını təmin edir. "Dayanmaq" və "durmaq" arasındakı fərqi bilmək həm cərimədən, həm də yolun bağlanmasından qoruyur.

> **Diqqət:** "Dayanmaq qadağandır" (3.27) həm dayanmağı, həm durmağı qadağan edir. "Durmaq qadağandır" (3.28) isə yalnız durmağı — dayanmaq (qısa müddətə, sərnişin mindirib-endirmək) icazəlidir.

## Yekun

- 3.27 dayanma və durmağı, 3.28 yalnız durmağı qadağan edir.
- 3.29 tək günlərdə, 3.30 cüt günlərdə durmağı qadağan edir.
- 3.31 bütün məhdudiyyətlər zonasının qurtaracağını bildirir.
- 3.32 ehtiyat üçün ayrılmış duracaq yerini göstərir.`,
    questions: [
      { q: '3.27 nişanı nəyi qadağan edir?', options: ['Həm dayanmağı, həm durmağı', 'Yalnız durmağı', 'Yalnız ötməyi', 'Yalnız sürəti'], correct: 0, explanation: '3.27 "Dayanmaq qadağandır" nişanı nəqliyyat vasitələrinin dayanmasını və durmasını qadağan edir.' },
      { q: '3.28 nişanı nəyi qadağan edir?', options: ['Yalnız durmağı', 'Həm dayanmağı, həm durmağı', 'Yalnız dayanmağı', 'Ötməyi'], correct: 0, explanation: '3.28 "Durmaq qadağandır" nişanı yalnız durmağı qadağan edir, dayanmanı qadağan etmir.' },
      { q: '3.29 nişanı nəyi bildirir?', options: ['Ayın tək günlərində durmaq qadağandır', 'Ayın cüt günlərində durmaq qadağandır', 'Bütün günlər durmaq qadağandır', 'Həftə sonu durmaq qadağandır'], correct: 0, explanation: '3.29 nişanı ayın tək günlərində durmağı qadağan edir.' },
      { q: '3.30 nişanı nəyi bildirir?', options: ['Ayın cüt günlərində durmaq qadağandır', 'Ayın tək günlərində durmaq qadağandır', 'Yalnız gecə durmaq qadağandır', 'Bütün günlər durmaq qadağandır'], correct: 0, explanation: '3.30 nişanı ayın cüt günlərində durmağı qadağan edir.' },
      { q: '3.31 nişanı nəyi bildirir?', options: ['Bütün məhdudiyyətlər zonasının qurtaracağını', 'Bütün məhdudiyyətlərin başlanğıcını', 'Dayanacaq yerini', 'Yolun sonunu'], correct: 0, explanation: '3.31 nişanı eyni vaxtda bir neçə nişanın qüvvədə olduğu sahənin bitməsini bildirir.' },
      { q: '3.32 nişanı nəyi göstərir?', options: ['Ehtiyat üçün ayrılmış duracaq yerini', 'Pulsuz duracaq yerini', 'Ödənişli dayanacağı', 'Yeraltı qarajı'], correct: 0, explanation: '3.32 nişanı ehtiyat üçün ayrılmış duracaq yerini göstərir.' },
      { q: '"Durmaq qadağandır" nişanı (3.28) olan yerdə nə etmək olar?', options: ['Sərnişin mindirib-endirmək üçün qısa dayanmaq', 'Uzun müddət durmaq', 'Gecələmək', 'Maşını tərk etmək'], correct: 0, explanation: '3.28 yalnız durmağı qadağan edir — qısa müddətə dayanmaq (sərnişin mindirib-endirmək) icazəlidir.' },
      { q: '3.27 nişanı olan yerdə dayanmaq olarmı?', options: ['Xeyr, həm dayanmaq, həm durmaq qadağandır', 'Bəli, qısa dayanmaq olar', 'Yalnız gecə dayanmaq olar', 'Yalnız yük maşınları dayana bilər'], correct: 0, explanation: '3.27 nişanı nəqliyyat vasitələrinin dayanmasını və durmasını qadağan edir.' },
      { q: '3.29 və 3.30 nişanları necə tətbiq olunur?', options: ['Yolun müxtəlif tərəflərində — tək və cüt günlər üçün', 'Eyni tərəfdə birlikdə', 'Yalnız yayda', 'Yalnız qışda'], correct: 0, explanation: '3.29 və 3.30 nişanları yolun hərəkət hissəsinin müxtəlif tərəflərində qoyulur: tək günlərdə bir tərəfdə, cüt günlərdə digər tərəfdə durmaq olar.' },
      { q: '3.32 nişanının üzərində hansı təsvir var?', options: ['Əlil arabası', 'Avtomobil', 'Velosiped', 'Rəqəm'], correct: 0, explanation: '3.32 nişanının üzərində əlil arabası təsviri var.' },
      { q: '"Dayanmaq" və "durmaq" arasındakı fərq nədir?', options: ['Durmaq uzun müddətli dayanmadır, dayanmaq qısa', 'Fərq yoxdur', 'Dayanmaq yalnız svetoforda olur', 'Durmaq yalnız qarajda olur'], correct: 0, explanation: 'Durmaq — nəqliyyat vasitəsinin uzun müddət saxlanması, dayanmaq isə qısa müddətli (sərnişin mindirib-endirmək) dayanmadır.' },
      { q: 'Bütün məhdudiyyətlərin bitdiyini hansı nişan bildirir?', options: ['3.31', '3.27', '3.28', '3.32'], correct: 0, explanation: '3.31 nişanı bütün məhdudiyyətlər zonasının qurtaracağını bildirir.' },
      { q: '3.27 nişanının üzərində neçə mavi zolaq var?', options: ['İki', 'Bir', 'Üç', 'Heç biri'], correct: 0, explanation: '3.27 "Dayanmaq qadağandır" nişanının üzərində iki mavi zolaq var.' },
      { q: '3.28 nişanının üzərində neçə mavi zolaq var?', options: ['Bir', 'İki', 'Üç', 'Heç biri'], correct: 0, explanation: '3.28 "Durmaq qadağandır" nişanının üzərində bir mavi zolaq var.' },
      { q: '3.32 nişanının qüvvədə olduğu duracaq yerindən kim istifadə edə bilər?', options: ['Yalnız müvafiq icazəsi olan nəqliyyat vasitələri', 'Hər kəs', 'Yalnız taksi', 'Yalnız yük maşınları'], correct: 0, explanation: 'Ehtiyat üçün ayrılmış duracaq yeri (3.32) yalnız müvafiq icazəsi olan nəqliyyat vasitələri üçündür.' },
    ],
  },


  {
    title: 'Xəbərdarlıq nişanları: dəmir yol keçidi və döngələr',
    codes: ['1.1', '1.2', '1.3.1', '1.3.2', '1.4.1', '1.4.4', '1.11.1', '1.11.2', '1.12.1', '1.12.2', '1.18.1', '1.18.2', '1.18.3', '1.31.1', '1.31.2'],
    content: `## Kənd yolunda dəmir yol keçidi

Şəhərdən çıxıb kənd yoluna çıxmısan. Uzaqda üçbucaqlı nişan görünür: üzərində şlaqbaum təsviri var — qarşıda şlaqbaumlu dəmir yol keçidi var.

![nisan:1.1]

Başqa bir keçiddə isə nişanın üzərində lokomotiv təsviri olur — bu, şlaqbaumsuz dəmir yol keçididir. Burada səni heç bir maneə saxlamayacaq, qərarı özün verməlisən.

![nisan:1.2]

Keçidə yaxınlaşdıqca yolun kənarında əlavə nişanlar görünür. Onlardan biri birxətli dəmir yolunu bildirir — relslər tək cərgədir.

![nisan:1.3.1]

Digəri isə çoxxətli dəmir yoludur: bir neçə relsin olduğu keçiddə bir qatar keçdikdən sonra arxasınca ikincisi gələ bilər.

![nisan:1.3.2]

Keçidə qədər olan məsafəni üzərində maili zolaqlar olan nişanlar bildirir — dəmir yol keçidinə yaxınlaşma nişanları. Zolaqların sayı azaldıqca keçidə yaxınlaşdığını başa düşürsən.

![nisan:1.4.1]

![nisan:1.4.4]

## Dağ yolunda döngələr

Keçidi arxada qoyub dağ yoluna qalxırsan. Üçbucaqlı nişanın içindəki əyri xətt sənə deyir: qarşıda təhlükəli döngə var. Nişandakı əyrinin istiqaməti döngənin hansı tərəfə olduğunu göstərir.

![nisan:1.11.1]

![nisan:1.11.2]

Bir az sonra əyri xətt ikiqat olur — bu, təhlükəli döngələr nişanıdır. Bir deyil, ardıcıl bir neçə döngə səni gözləyir, sürəti əvvəlcədən azaltmalısan.

![nisan:1.12.1]

![nisan:1.12.2]

Döngənin özündə yolun kənarında oxlarla dolu lövhələr görünür — döngənin istiqaməti nişanları. Onlar yolun hansı tərəfə döndüyünü göstərir.

![nisan:1.31.1]

![nisan:1.31.2]

## Yolun daralması

Enişdən sonra yol daralır. Üçbucaqlı nişan yolun daralmasını bildirir: nişanın variantından asılı olaraq yol hər iki tərəfdən, sağdan və ya soldan daralır.

![nisan:1.18.1]

![nisan:1.18.2]

![nisan:1.18.3]

### Niyə vacibdir

Xəbərdarlıq nişanları heç bir məhdudiyyət qoymur — sənə "dayan" və ya "keçmə" demir. Onların bütün işi qarşıdakı təhlükə barədə səni əvvəlcədən xəbərdar etməkdir. Nişanı gördükdə ilk növbədə diqqətini artırmalı və şəraitə uyğun sürət seçərək hərəkətin təhlükəsizliyini təmin edəcək tədbir görməlisən.

> **Diqqət:** Şlaqbaumlu (1.1) və şlaqbaumsuz (1.2) keçid arasındakı fərq təhlükənin ölçüsünü dəyişir: şlaqbaumsuz keçiddə səni saxlayacaq maneə yoxdur, bütün məsuliyyət sürücünün üzərindədir.

## Yekun

- Xəbərdarlıq nişanları məhdudiyyət qoymur, diqqəti artırmağı və şəraitə uyğun sürət seçməyi tələb edir.
- 1.1 şlaqbaumlu, 1.2 şlaqbaumsuz dəmir yol keçidini bildirir.
- 1.3.1 birxətli, 1.3.2 çoxxətli dəmir yolunu göstərir.
- 1.4 qrupu keçidə yaxınlaşmanı, 1.11 təhlükəli döngəni, 1.12 ardıcıl döngələri bildirir.
- 1.31 döngənin istiqamətini, 1.18 qrupu isə yolun daralmasını göstərir.`,
    questions: [
      { q: '1.1 nişanı nəyi bildirir?', options: ['Şlaqbaumlu dəmir yol keçidini', 'Şlaqbaumsuz dəmir yol keçidini', 'Tramvay xəttini', 'Yolun daralmasını'], correct: 0, explanation: '1.1 nişanı şlaqbaumlu dəmir yol keçidini bildirir.' },
      { q: '1.2 nişanı nəyi bildirir?', options: ['Şlaqbaumsuz dəmir yol keçidini', 'Şlaqbaumlu dəmir yol keçidini', 'Təhlükəli döngəni', 'Dalanı'], correct: 0, explanation: '1.2 nişanı şlaqbaumsuz dəmir yol keçidini bildirir.' },
      { q: '1.3.1 nişanı nəyi göstərir?', options: ['Birxətli dəmir yolunu', 'Çoxxətli dəmir yolunu', 'Tramvay dayanacağını', 'Yolun daralmasını'], correct: 0, explanation: '1.3.1 nişanı birxətli dəmir yolunu göstərir.' },
      { q: '1.3.2 nişanı nəyi göstərir?', options: ['Çoxxətli dəmir yolunu', 'Birxətli dəmir yolunu', 'İkitərəfli hərəkəti', 'Dairəvi hərəkəti'], correct: 0, explanation: '1.3.2 nişanı çoxxətli dəmir yolunu göstərir.' },
      { q: '1.4 qrupundakı nişanlar nəyi bildirir?', options: ['Dəmir yol keçidinə yaxınlaşmanı', 'Yolun daralmasını', 'Döngənin istiqamətini', 'Piyada keçidini'], correct: 0, explanation: '1.4 qrupundakı nişanlar dəmir yol keçidinə yaxınlaşmanı bildirir.' },
      { q: '1.11 qrupundakı nişan nəyi bildirir?', options: ['Təhlükəli döngəni', 'Ardıcıl gələn bir neçə döngəni', 'Yolun daralmasını', 'Sürüşkən yolu'], correct: 0, explanation: '1.11.1 və 1.11.2 nişanları təhlükəli döngəni bildirir.' },
      { q: '1.12 qrupundakı nişan nəyi bildirir?', options: ['Ardıcıl gələn təhlükəli döngələri', 'Tək bir döngəni', 'Dəmir yol keçidini', 'Yol işlərini'], correct: 0, explanation: '1.12.1 və 1.12.2 nişanları təhlükəli döngələri — ardıcıl gələn bir neçə döngəni bildirir.' },
      { q: '1.18 qrupundakı nişanlar nəyi bildirir?', options: ['Yolun daralmasını', 'Yolun genişlənməsini', 'Dəmir yol keçidini', 'Dalanı'], correct: 0, explanation: '1.18.1, 1.18.2 və 1.18.3 nişanları yolun daralmasını bildirir.' },
      { q: '1.31 qrupundakı nişanlar nəyi göstərir?', options: ['Döngənin istiqamətini', 'Yolun nömrəsini', 'Sürət həddini', 'Dayanacaq yerini'], correct: 0, explanation: '1.31.1, 1.31.2 və 1.31.3 nişanları döngənin istiqamətini göstərir.' },
      { q: 'Xəbərdarlıq nişanı gördükdə sürücü ilk növbədə nə etməlidir?', options: ['Diqqətini artırmalı və şəraitə uyğun sürət seçməlidir', 'Dərhal dayanmalıdır', 'Sürəti artırmalıdır', 'Geriyə dönməlidir'], correct: 0, explanation: 'Sürücü xəbərdarlıq nişanını gördükdə diqqətini artırmalı və şəraitə uyğun sürət seçərək təhlükəsizliyi təmin edəcək tədbir görməlidir.' },
      { q: 'Xəbərdarlıq nişanları hansı məhdudiyyəti qoyur?', options: ['Heç bir məhdudiyyət qoymur', 'Sürəti 40 km/saata endirir', 'Ötməyi qadağan edir', 'Dayanmağı qadağan edir'], correct: 0, explanation: 'Xəbərdarlıq nişanları heç bir məhdudiyyət qoymur — yalnız qarşıdakı təhlükə barədə xəbərdar edir.' },
      { q: 'Şlaqbaumsuz keçid (1.2) niyə daha çox diqqət tələb edir?', options: ['Sürücünü saxlayacaq maneə yoxdur, qərarı özü verir', 'Orada qatar heç vaxt keçmir', 'Orada sürət həddi yoxdur', 'Orada relslər yoxdur'], correct: 0, explanation: 'Şlaqbaumsuz keçiddə sürücünü saxlayacaq maneə olmadığı üçün bütün məsuliyyət sürücünün üzərinə düşür.' },
      { q: 'Çoxxətli dəmir yolu nişanı (1.3.2) nəyə görə xüsusilə vacibdir?', options: ['Bir qatardan sonra arxasınca digəri gələ bilər', 'Orada şlaqbaum həmişə açıq olur', 'Orada qatar yavaş gedir', 'Orada keçmək qadağandır'], correct: 0, explanation: 'Çoxxətli dəmir yolunda bir neçə rels var — bir qatar keçdikdən sonra arxasınca ikincisi gələ bilər.' },
      { q: '1.11 və 1.12 nişanları arasındakı fərq nədir?', options: ['1.11 tək döngəni, 1.12 ardıcıl döngələri bildirir', '1.11 sağa, 1.12 sola döngəni bildirir', '1.12 yalnız dağ yollarında qoyulur', 'Fərq yoxdur'], correct: 0, explanation: '1.11 təhlükəli döngəni, 1.12 isə ardıcıl gələn təhlükəli döngələri bildirir.' },
      { q: 'Döngənin istiqaməti nişanları (1.31) nə üçün faydalıdır?', options: ['Yolun hansı tərəfə döndüyünü göstərir', 'Sürət həddini artırır', 'Dayanacaq yerini bildirir', 'Ötməyə icazə verir'], correct: 0, explanation: 'Döngənin istiqaməti nişanları yolun hansı tərəfə döndüyünü göstərir.' },
    ],
  },
  {
    title: 'Qadağanedici nişanlar: qabarit, kütlə və xüsusi qadağalar',
    codes: ['3.11', '3.12', '3.13', '3.14', '3.15', '3.16', '3.17.1', '3.17.2', '3.18.1', '3.18.2', '3.34', '3.35'],
    content: `## Yüklü maşınla şəhərdən çıxış

Sükan arxasında yüklü bir yük maşını var və qarşıda dairəvi qırmızı haşiyəli nişanlar sıralanıb. Birincisinin içində rəqəm və "t" hərfi var: ümumi faktiki kütləsi nişanda göstərilən kütlədən artıq olan nəqliyyat vasitələrinin və nəqliyyat vasitələri avtoqatarlarının hərəkəti qadağandır.

![nisan:3.11]

Növbəti nişan oxa düşən ağırlığı məhdudlaşdırır: hər hansı bir oxuna düşən faktiki ağırlıq nişanda göstərilən həddən artıq olan nəqliyyat vasitələrinin hərəkəti qadağandır. Ümumi kütlə uyğun gəlsə də, ağırlıq bir oxa yığılıbsa, yol bağlıdır.

![nisan:3.12]

Körpünün altından keçəcəksən — hündürlüyün məhdudlaşdırılması nişanı qarşındadır. Qabarit hündürlüyü (yük ilə və ya yüksüz) nişanda göstərilən həddən artıq olan nəqliyyat vasitələrinin hərəkəti qadağandır.

![nisan:3.13]

Dar keçiddə eni məhdudlaşdıran nişan var: qabarit eni (yük ilə və ya yüksüz) göstərilən həddən artıq olanlar keçə bilməz.

![nisan:3.14]

Uzun avtoqatarlar üçün ayrıca nişan var — uzunluğun məhdudlaşdırılması. Qabarit uzunluğu göstərilən həddən artıq olan nəqliyyat vasitələrinin (avtoqatarların) hərəkəti qadağandır.

![nisan:3.15]

Bəzi sahələrdə isə maşınlar arasındakı boşluq nizamlanır: minimum ara məsafənin məhdudlaşdırılması. Nəqliyyat vasitələrinin arasındakı məsafə nişanda göstərilən həddən az olarsa, onların hərəkəti qadağandır.

![nisan:3.16]

## Nəzarət məntəqəsi və bağlı yol

Sərhəd istiqamətində gömrükxana nişanı görünür: gömrükxananın (nəzarət məntəqəsinin) qarşısında dayanmadan hərəkət etmək qadağandır.

![nisan:3.17.1]

Bir az irəlidə "Təhlükə" nişanı yolu tamamilə bağlayır. Yol-nəqliyyat hadisəsi, qəza və ya digər təhlükələrlə əlaqədar olaraq bütün nəqliyyat vasitələrinin hərəkəti qadağandır.

![nisan:3.17.2]

## Dönmə qadağaları

Şəhərə qayıdanda yolayrıcında sağa dönmək qadağandır nişanı ilə qarşılaşırsan — bu istiqamətə dönmək olmaz.

![nisan:3.18.1]

Başqa bir yolayrıcında sola dönmək qadağandır nişanı dayanır. Diqqət et: bu nişan geriyə dönməyə icazə verir.

![nisan:3.18.2]

## Təhlükəli yüklər

Şəhərin mərkəzinə aparan yolda təhlükəli yükü olan nəqliyyat vasitələrinin hərəkəti qadağandır nişanı var.

![nisan:3.34]

Onun yanında daha sərt variantı: partlayıcı və tezalışan yükü olan nəqliyyat vasitələrinin hərəkəti qadağandır.

![nisan:3.35]

### Niyə vacibdir

Qabarit və kütlə məhdudiyyətləri təsadüfi rəqəmlər deyil: körpünün daşıya biləcəyi ağırlıq, tunelin hündürlüyü, yolun eni realdır. Nişanı nəzərə almayan sürücü ya körpüdə ilişir, ya da yol örtüyünü dağıdır.

> **Diqqət:** 3.11 ümumi kütləyə, 3.12 isə bir oxa düşən ağırlığa baxır. Maşının ümumi kütləsi qaydaya uyğun olsa belə, yük bir oxa yığılıbsa, 3.12 nişanı yenə də səni saxlaya bilər.

## Yekun

- 3.11 kütləni, 3.12 oxa düşən ağırlığı məhdudlaşdırır.
- 3.13 hündürlüyü, 3.14 eni, 3.15 uzunluğu, 3.16 minimum ara məsafəni məhdudlaşdırır.
- 3.17.1 gömrükxanada dayanmadan keçməyi, 3.17.2 isə bütün hərəkəti qadağan edir.
- 3.18.1 sağa, 3.18.2 sola dönməyi qadağan edir; 3.18.2 geriyə dönməyə icazə verir.
- 3.34 təhlükəli yüklü, 3.35 partlayıcı və tezalışan yüklü nəqliyyatın hərəkətini qadağan edir.`,
    questions: [
      { q: '3.11 nişanı nəyi məhdudlaşdırır?', options: ['Nəqliyyat vasitəsinin ümumi faktiki kütləsini', 'Oxa düşən ağırlığı', 'Qabarit hündürlüyünü', 'Sürəti'], correct: 0, explanation: '3.11 nişanı ümumi faktiki kütləsi göstərilən həddən artıq olan nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: '3.12 nişanı nəyi məhdudlaşdırır?', options: ['Oxa düşən ağırlığı', 'Ümumi kütləni', 'Uzunluğu', 'Eni'], correct: 0, explanation: '3.12 nişanı hər hansı bir oxa düşən faktiki ağırlığı məhdudlaşdırır.' },
      { q: '3.13 nişanı nəyi məhdudlaşdırır?', options: ['Qabarit hündürlüyünü', 'Qabarit enini', 'Kütləni', 'Sürəti'], correct: 0, explanation: '3.13 nişanı qabarit hündürlüyü (yük ilə və ya yüksüz) göstərilən həddən artıq olan nəqliyyatın hərəkətini qadağan edir.' },
      { q: '3.14 nişanı nəyi məhdudlaşdırır?', options: ['Qabarit enini', 'Qabarit hündürlüyünü', 'Uzunluğu', 'Ara məsafəni'], correct: 0, explanation: '3.14 nişanı qabarit eni göstərilən həddən artıq olan nəqliyyatın hərəkətini qadağan edir.' },
      { q: '3.15 nişanı nəyi məhdudlaşdırır?', options: ['Qabarit uzunluğunu', 'Kütləni', 'Sürəti', 'Hündürlüyü'], correct: 0, explanation: '3.15 nişanı qabarit uzunluğu göstərilən həddən artıq olan nəqliyyat vasitələrinin (avtoqatarların) hərəkətini qadağan edir.' },
      { q: '3.16 nişanı nəyi tələb edir?', options: ['Nəqliyyat vasitələri arasında minimum ara məsafəni', 'Maksimum sürəti', 'Minimum sürəti', 'Maksimum kütləni'], correct: 0, explanation: '3.16 nişanı nəqliyyat vasitələri arasındakı məsafə göstərilən həddən az olarsa hərəkəti qadağan edir.' },
      { q: '3.17.1 nişanı nəyi tələb edir?', options: ['Gömrükxananın qarşısında dayanmağı', 'Sürəti artırmağı', 'Geriyə dönməyi', 'Ötməyi'], correct: 0, explanation: '3.17.1 nişanı gömrükxananın (nəzarət məntəqəsinin) qarşısında dayanmadan hərəkət etməyi qadağan edir.' },
      { q: '3.17.2 "Təhlükə" nişanı nəyi bildirir?', options: ['Bütün nəqliyyat vasitələrinin hərəkəti qadağandır', 'Yalnız yük maşınları keçə bilməz', 'Sürət həddi dəyişir', 'Ötmək qadağandır'], correct: 0, explanation: '3.17.2 nişanı yol-nəqliyyat hadisəsi, qəza və ya digər təhlükələrlə əlaqədar bütün nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: '3.18.2 "Sola dönmək qadağandır" nişanı geriyə dönməyə necə baxır?', options: ['Geriyə dönməyə icazə verir', 'Geriyə dönməyi də qadağan edir', 'Yalnız gecə icazə verir', 'Yalnız taksilərə icazə verir'], correct: 0, explanation: '3.18.2 nişanı sola dönməyi qadağan edir, geriyə dönməyə isə icazə verilir.' },
      { q: '3.18.1 nişanı nəyi qadağan edir?', options: ['Sağa dönməyi', 'Sola dönməyi', 'Geriyə dönməyi', 'Düzünə hərəkəti'], correct: 0, explanation: '3.18.1 nişanı sağa dönməyi qadağan edir.' },
      { q: '3.34 nişanı kimə aiddir?', options: ['Təhlükəli yükü olan nəqliyyat vasitələrinə', 'Bütün yük maşınlarına', 'Minik avtomobillərinə', 'Velosipedlərə'], correct: 0, explanation: '3.34 nişanı təhlükəli yükü olan nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: '3.35 nişanı kimə aiddir?', options: ['Partlayıcı və tezalışan yükü olan nəqliyyata', 'Bütün nəqliyyata', 'Yalnız avtobuslara', 'Yalnız traktorlara'], correct: 0, explanation: '3.35 nişanı partlayıcı və tezalışan yükü olan nəqliyyat vasitələrinin hərəkətini qadağan edir.' },
      { q: 'Maşının ümumi kütləsi qaydaya uyğundur, amma yük bir oxa yığılıb. Hansı nişan səni saxlaya bilər?', options: ['3.12 — oxa düşən ağırlığın məhdudlaşdırılması', '3.11 — kütlənin məhdudlaşdırılması', '3.15 — uzunluğun məhdudlaşdırılması', '3.16 — ara məsafə'], correct: 0, explanation: '3.12 nişanı bir oxa düşən faktiki ağırlığa baxır, ümumi kütləyə deyil.' },
      { q: 'Qabarit hündürlüyü ölçülərkən yük nəzərə alınırmı?', options: ['Bəli — yük ilə və ya yüksüz qabarit hündürlüyü nəzərə alınır', 'Xeyr, yalnız boş maşın ölçülür', 'Yalnız yük maşınlarında', 'Yalnız avtoqatarlarda'], correct: 0, explanation: '3.13 nişanı qabarit hündürlüyünü yük ilə və ya yüksüz halda nəzərə alır.' },
      { q: '3.16 nişanının qüvvədə olduğu sahədə nə vacibdir?', options: ['Maşınlar arasında göstərilən məsafədən az qalmamaq', 'Sürəti azaltmaq', 'Sağ zolaqla getmək', 'Ötməmək'], correct: 0, explanation: '3.16 nişanı nəqliyyat vasitələri arasındakı məsafənin göstərilən həddən az olmasını qadağan edir.' },
    ],
  },
  {
    title: 'Məcburi nişanlar: hərəkət istiqaməti və maneə',
    codes: ['4.1.1', '4.1.2', '4.1.3', '4.1.4', '4.1.5', '4.1.6', '4.2.1', '4.2.2', '4.2.3', '4.3'],
    content: `## Mavi dairələrin əmri

Şəhərin mərkəzində yolayrıcına yaxınlaşırsan və qarşındakı nişan artıq qırmızı deyil — mavi dairənin içində ağ ox var. Bu, məcburi hərəkət istiqaməti nişanıdır: qadağandan fərqli olaraq o sənə nəyin qadağan olduğunu yox, hansı istiqamətə getməli olduğunu deyir. Yuxarı yönəlmiş ox düzünə hərəkəti göstərir.

![nisan:4.1.1]

Növbəti yolayrıcında ox sağa əyilib — yalnız sağa hərəkət etməlisən.

![nisan:4.1.2]

Bir küçə sonra ox sola baxır: sola hərəkət.

![nisan:4.1.3]

Bəzi yolayrıcılarında isə sənə seçim verilir. İki oxlu nişan düzünə və ya sağa hərəkəti göstərir.

![nisan:4.1.4]

Digəri düzünə və ya sola hərəkətə icazə verir.

![nisan:4.1.5]

Üçüncüsü isə sağa və ya sola — yəni düzünə getmək olmaz.

![nisan:4.1.6]

## Yol ortasındakı maneə

Küçənin ortasında təhlükəsizlik adacığı və ya təmir sahəsi var. Onun qarşısındakı nişan sənə maneəni sağdan keçməyi göstərir.

![nisan:4.2.1]

Başqa bir yerdə eyni nişanın ox istiqaməti dəyişir — maneəni soldan keçmə.

![nisan:4.2.2]

Bəzi hallarda isə hər iki tərəf açıqdır: maneəni sağdan və ya soldan keçmək olar.

![nisan:4.2.3]

## Dairəvi hərəkət

Böyük meydana çatırsan. Mavi dairənin içində dairə üzrə düzülmüş üç ox var — dairəvi hərəkət nişanı. Meydana daxil olduqdan sonra hərəkət yalnız nişanda göstərilən istiqamətdə davam edir.

![nisan:4.3]

### Niyə vacibdir

Məcburi nişanlar mavi fonu ilə seçilir və onlar əmr verir: burada sənin seçimin yoxdur, göstərilən istiqamətdə getməlisən. Qadağanedici nişan "bunu etmə" deyir, məcburi nişan isə "bunu et" deyir — ikisini qarışdırmaq yolayrıcında səhv manevrə gətirib çıxarır.

> **Diqqət:** 4.1 qrupunda oxların sayı və istiqaməti hər şeyi həll edir. Bir oxlu nişan tək istiqamətə icazə verir, iki oxlu nişan isə iki istiqamət arasında seçim verir — nişanda göstərilməyən istiqamətə dönmək olmaz.

## Yekun

- Məcburi nişanlar mavi fonludur və hərəkət istiqamətini əmr edir.
- 4.1.1 düzünə, 4.1.2 sağa, 4.1.3 sola hərəkəti göstərir.
- 4.1.4 düzünə və ya sağa, 4.1.5 düzünə və ya sola, 4.1.6 sağa və ya sola hərəkətə icazə verir.
- 4.2.1 maneəni sağdan, 4.2.2 soldan, 4.2.3 hər iki tərəfdən keçməyi göstərir.
- 4.3 dairəvi hərəkəti bildirir.`,
    questions: [
      { q: 'Məcburi nişanların fonu hansı rəngdədir?', options: ['Mavi', 'Qırmızı', 'Sarı', 'Yaşıl'], correct: 0, explanation: 'Məcburi hərəkət istiqaməti nişanları mavi fonlu dairəvi nişanlardır.' },
      { q: '4.1.1 nişanı nəyi göstərir?', options: ['Düzünə hərəkəti', 'Sağa hərəkəti', 'Sola hərəkəti', 'Dairəvi hərəkəti'], correct: 0, explanation: '4.1.1 nişanı düzünə hərəkəti göstərir.' },
      { q: '4.1.2 nişanı nəyi göstərir?', options: ['Sağa hərəkəti', 'Sola hərəkəti', 'Düzünə hərəkəti', 'Geriyə dönməni'], correct: 0, explanation: '4.1.2 nişanı sağa hərəkəti göstərir.' },
      { q: '4.1.3 nişanı nəyi göstərir?', options: ['Sola hərəkəti', 'Sağa hərəkəti', 'Düzünə hərəkəti', 'Dairəvi hərəkəti'], correct: 0, explanation: '4.1.3 nişanı sola hərəkəti göstərir.' },
      { q: '4.1.4 nişanı hansı istiqamətlərə icazə verir?', options: ['Düzünə və ya sağa', 'Düzünə və ya sola', 'Sağa və ya sola', 'Yalnız düzünə'], correct: 0, explanation: '4.1.4 nişanı düzünə və ya sağa hərəkətə icazə verir.' },
      { q: '4.1.5 nişanı hansı istiqamətlərə icazə verir?', options: ['Düzünə və ya sola', 'Düzünə və ya sağa', 'Sağa və ya sola', 'Yalnız sola'], correct: 0, explanation: '4.1.5 nişanı düzünə və ya sola hərəkətə icazə verir.' },
      { q: '4.1.6 nişanı hansı istiqamətlərə icazə verir?', options: ['Sağa və ya sola', 'Düzünə və ya sağa', 'Düzünə və ya sola', 'Yalnız düzünə'], correct: 0, explanation: '4.1.6 nişanı sağa və ya sola hərəkətə icazə verir.' },
      { q: '4.2.1 nişanı nəyi göstərir?', options: ['Maneəni sağdan keçməyi', 'Maneəni soldan keçməyi', 'Maneənin qarşısında dayanmağı', 'Geriyə dönməyi'], correct: 0, explanation: '4.2.1 nişanı maneəni sağdan keçməyi göstərir.' },
      { q: '4.2.2 nişanı nəyi göstərir?', options: ['Maneəni soldan keçməyi', 'Maneəni sağdan keçməyi', 'Maneəni keçməyin qadağan olduğunu', 'Dairəvi hərəkəti'], correct: 0, explanation: '4.2.2 nişanı maneəni soldan keçməyi göstərir.' },
      { q: '4.2.3 nişanı nəyi göstərir?', options: ['Maneəni sağdan və ya soldan keçməyi', 'Yalnız sağdan keçməyi', 'Yalnız soldan keçməyi', 'Maneənin qarşısında dayanmağı'], correct: 0, explanation: '4.2.3 nişanı maneəni sağdan və ya soldan keçməyə icazə verir.' },
      { q: '4.3 nişanı nəyi bildirir?', options: ['Dairəvi hərəkəti', 'Dairəvi hərəkətlə kəsişməni', 'Geriyə dönmə yerini', 'Dalanı'], correct: 0, explanation: '4.3 nişanı dairəvi hərəkəti bildirir.' },
      { q: 'Qadağanedici və məcburi nişan arasındakı əsas fərq nədir?', options: ['Qadağanedici "etmə", məcburi "bunu et" deyir', 'İkisi də eyni mənanı verir', 'Məcburi nişanlar yalnız gecə işləyir', 'Qadağanedici nişanlar mavi olur'], correct: 0, explanation: 'Qadağanedici nişan hərəkəti qadağan edir, məcburi nişan isə hansı istiqamətdə getməli olduğunu göstərir.' },
      { q: '4.1.6 nişanı olan yolayrıcında düzünə getmək olarmı?', options: ['Xeyr — yalnız sağa və ya sola', 'Bəli, istənilən istiqamətə', 'Yalnız gecə saatlarında', 'Yalnız taksilər üçün'], correct: 0, explanation: '4.1.6 nişanı yalnız sağa və ya sola hərəkətə icazə verir, düzünə hərəkət nişanda göstərilmir.' },
      { q: 'Yolun ortasındakı maneəni hansı nişan qrupunun nişanı göstərir?', options: ['4.2 qrupu', '4.1 qrupu', '3.18 qrupu', '5.19 qrupu'], correct: 0, explanation: '4.2 qrupundakı nişanlar maneəni hansı tərəfdən keçmək lazım olduğunu göstərir.' },
      { q: 'İki oxlu 4.1 nişanı nə deməkdir?', options: ['Göstərilən iki istiqamətdən birini seçə bilərsən', 'Hər istiqamətə getmək olar', 'Heç bir istiqamətə dönmək olmaz', 'Yalnız geriyə dönmək olar'], correct: 0, explanation: 'İki oxlu nişan yalnız nişanda göstərilən iki istiqamətə icazə verir.' },
    ],
  },
  {
    title: 'Məcburi nişanlar: zolaqlar, sürət və təhlükəli yük marşrutu',
    codes: ['4.4', '4.5', '4.6', '4.7', '4.8', '4.9.1', '4.9.2', '4.9.3'],
    content: `## Zolaqların öz sahibləri var

Geniş prospektə çıxırsan. Mavi dairənin içində minik avtomobili təsviri olan nişan bu yolun kimə aid olduğunu bildirir — minik avtomobillərinin hərəkəti.

![nisan:4.4]

Sağ tərəfdə yoldan ayrılan zolağın üstündə velosiped təsvirli mavi nişan var: velosiped zolağı. Bu zolaq velosipedçilər üçündür.

![nisan:4.5]

Yolun kənarında piyada təsvirli mavi nişan piyada zolağını göstərir — piyadaların hərəkəti üçün ayrılmış sahə.

![nisan:4.6]

## Sürətin aşağı həddi

Şəhərdən çıxan sürətli yolda maraqlı bir nişan görünür: mavi dairənin içində rəqəm. Bu, maksimum deyil, minimum sürətin məhdudlaşdırılmasıdır — burada göstərilən sürətdən yavaş getmək axını pozur.

![nisan:4.7]

Bir müddət sonra həmin nişanın üstündən xətt çəkilmiş variantı görünür: minimum sürətin məhdudlaşdırıldığı zonanın qurtaracağı.

![nisan:4.8]

## Təhlükəli yükün öz marşrutu

Sənaye zonasına aparan yolda mavi nişanların üstündə "təhlükəli yük" işarəsi və ox var. Bunlar təhlükəli yükü olan nəqliyyat vasitələrinin hərəkət istiqamətini göstərir: belə yük daşıyan maşınlar şəhərin içindən deyil, bu nişanların göstərdiyi marşrutla getməlidir.

![nisan:4.9.1]

![nisan:4.9.2]

![nisan:4.9.3]

### Niyə vacibdir

Məcburi nişanlar yalnız istiqamət göstərmir — onlar yolun hansı hissəsinin kimə aid olduğunu və hansı sürət rejiminin gözlənildiyini də müəyyən edir. Velosiped və piyada zolaqları məhz bunun üçün var: zəif iştirakçını ağır axından ayırmaq.

> **Diqqət:** 4.7 nişanını 3.24 ilə qarışdırma. 3.24 maksimum sürəti məhdudlaşdırır (bundan sürətli getmək olmaz), 4.7 isə minimum sürəti göstərir (bundan yavaş getmək gözlənilmir).

## Yekun

- 4.4 minik avtomobillərinin hərəkətini bildirir.
- 4.5 velosiped zolağını, 4.6 piyada zolağını göstərir.
- 4.7 minimum sürəti, 4.8 həmin zonanın qurtaracağını bildirir.
- 4.9 qrupu təhlükəli yükü olan nəqliyyat vasitələrinin hərəkət istiqamətini göstərir.
- Mavi dairə əmr edir, qırmızı haşiyəli dairə isə qadağan edir.`,
    questions: [
      { q: '4.4 nişanı nəyi bildirir?', options: ['Minik avtomobillərinin hərəkətini', 'Yük avtomobillərinin hərəkətini', 'Velosiped zolağını', 'Piyada zolağını'], correct: 0, explanation: '4.4 nişanı minik avtomobillərinin hərəkətini bildirir.' },
      { q: '4.5 nişanı nəyi bildirir?', options: ['Velosiped zolağını', 'Piyada zolağını', 'Marşrut nəqliyyatı zolağını', 'Duracaq yerini'], correct: 0, explanation: '4.5 nişanı velosiped zolağını bildirir.' },
      { q: '4.6 nişanı nəyi bildirir?', options: ['Piyada zolağını', 'Piyada keçidini', 'Velosiped zolağını', 'Yeraltı keçidi'], correct: 0, explanation: '4.6 nişanı piyada zolağını bildirir.' },
      { q: '4.7 nişanı nəyi göstərir?', options: ['Minimum sürətin məhdudlaşdırılmasını', 'Maksimum sürətin məhdudlaşdırılmasını', 'Tövsiyə edilən sürəti', 'Sürət həddinin sonunu'], correct: 0, explanation: '4.7 nişanı minimum sürətin məhdudlaşdırılmasını göstərir.' },
      { q: '4.8 nişanı nəyi bildirir?', options: ['Minimum sürət zonasının qurtaracağını', 'Maksimum sürət zonasının qurtaracağını', 'Yolun sonunu', 'Zolağın sonunu'], correct: 0, explanation: '4.8 nişanı minimum sürətin məhdudlaşdırıldığı zonanın qurtaracağını bildirir.' },
      { q: '4.9 qrupundakı nişanlar nəyi göstərir?', options: ['Təhlükəli yüklü nəqliyyatın hərəkət istiqamətini', 'Yük avtomobillərinin dayanacağını', 'Sürət həddini', 'Piyada keçidini'], correct: 0, explanation: '4.9 qrupundakı nişanlar təhlükəli yükü olan nəqliyyat vasitələrinin hərəkət istiqamətini göstərir.' },
      { q: '3.24 və 4.7 nişanları arasındakı fərq nədir?', options: ['3.24 maksimum, 4.7 minimum sürəti göstərir', '3.24 minimum, 4.7 maksimum sürəti göstərir', 'İkisi də eynidir', '4.7 yalnız yük maşınlarına aiddir'], correct: 0, explanation: '3.24 maksimum sürəti məhdudlaşdırır, 4.7 isə minimum sürəti göstərir.' },
      { q: 'Mavi dairəvi nişanlar nə edir?', options: ['Əmr edir — hərəkətin necə olacağını göstərir', 'Yalnız xəbərdarlıq edir', 'Xidmət obyektini göstərir', 'Heç bir məna daşımır'], correct: 0, explanation: 'Məcburi nişanlar mavi dairə formasındadır və hərəkətin necə olacağını əmr edir.' },
      { q: 'Velosiped zolağı nişanı (4.5) kimin üçündür?', options: ['Velosipedçilər üçün', 'Piyadalar üçün', 'Minik avtomobilləri üçün', 'Avtobuslar üçün'], correct: 0, explanation: '4.5 nişanı velosipedçilər üçün ayrılmış zolağı göstərir.' },
      { q: 'Piyada zolağı nişanı (4.6) nəyi ayırır?', options: ['Piyadaların hərəkəti üçün ayrılmış sahəni', 'Avtomobil dayanacağını', 'Velosiped yolunu', 'Marşrut nəqliyyatı zolağını'], correct: 0, explanation: '4.6 nişanı piyadaların hərəkəti üçün ayrılmış zolağı göstərir.' },
      { q: 'Təhlükəli yük daşıyan sürücü 4.9 nişanlarını gördükdə nə etməlidir?', options: ['Nişanların göstərdiyi marşrutla getməlidir', 'Nişanları nəzərə almaya bilər', 'Dərhal dayanmalıdır', 'Geriyə dönməlidir'], correct: 0, explanation: '4.9 qrupundakı nişanlar təhlükəli yüklü nəqliyyatın hansı istiqamətlə getməli olduğunu göstərir.' },
      { q: '4.7 nişanının qüvvədə olduğu sahədə çox yavaş hərəkət niyə problemdir?', options: ['Nişan minimum sürəti müəyyən edir', 'Nişan maksimum sürəti müəyyən edir', 'Orada dayanmaq qadağandır', 'Orada ötmək qadağandır'], correct: 0, explanation: '4.7 minimum sürətin məhdudlaşdırılmasıdır — göstərilən həddən yavaş hərəkət nəzərdə tutulmur.' },
      { q: '4.8 nişanını gördükdən sonra nə dəyişir?', options: ['Minimum sürət tələbi bitir', 'Maksimum sürət tələbi bitir', 'Yol birtərəfli olur', 'Ötmək qadağan olunur'], correct: 0, explanation: '4.8 nişanı minimum sürətin məhdudlaşdırıldığı zonanın qurtaracağını bildirir.' },
      { q: '4.4 nişanı hansı nəqliyyat növünü göstərir?', options: ['Minik avtomobillərini', 'Traktorları', 'Motosikletləri', 'Velosipedləri'], correct: 0, explanation: '4.4 nişanının üzərində minik avtomobili təsviri var.' },
      { q: 'Məcburi nişanlar yolun hansı xüsusiyyətini müəyyən edə bilər?', options: ['Yolun hansı hissəsinin kimə aid olduğunu', 'Yolun neçə yaşı olduğunu', 'Yolun hansı şəhərə getdiyini', 'Yolun hansı təmir vəziyyətində olduğunu'], correct: 0, explanation: 'Məcburi nişanlar zolaqların kimin üçün nəzərdə tutulduğunu və hərəkət rejimini müəyyən edir.' },
    ],
  },
  {
    title: 'Məlumat-göstərici nişanlar: yolun növü və zolaqlar',
    codes: ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6', '5.7.1', '5.7.2', '5.8.1', '5.8.5', '5.9', '5.10.1', '5.10.4', '5.11.1', '5.11.2'],
    content: `## Magistrala çıxış

Şəhərdən çıxıb sürətli yola qalxırsan. Yaşıl fonlu düzbucaqlı nişan qarşındadır — avtomagistral. Bu nişan yolun növünü elan edir: buradan etibarən avtomagistral rejimi başlayır.

![nisan:5.1]

Onlarla kilometr sonra həmin nişanın üstündən xətt çəkilmiş variantı görünür: avtomagistralın qurtaracağı.

![nisan:5.2]

Bəzi yollar avtomagistral deyil, amma yalnız avtomobillər üçündür — bunu ayrıca nişan bildirir.

![nisan:5.3]

Onun da sonunu üstündən xətt çəkilmiş variant göstərir.

![nisan:5.4]

## Birtərəfli küçələr

Şəhərə qayıdıb dar küçəyə burulursan. Mavi düzbucaqlı nişanın üzərindəki uzun ağ ox birtərəfli yolu bildirir: bütün axın bir istiqamətdə hərəkət edir.

![nisan:5.5]

Küçənin sonunda birtərəfli yolun qurtaracağı nişanı dayanır — buradan sonra qarşıdan da hərəkət var.

![nisan:5.6]

Yan küçələrdən birtərəfli yola çıxarkən isə çıxışın hansı tərəfə mümkün olduğunu ayrıca nişanlar göstərir.

![nisan:5.7.1]

![nisan:5.7.2]

## Zolaqlar açılır və bağlanır

Prospektdə sağ tərəfdən yeni zolaq əlavə olunur — zolağın başlanğıcı nişanı bunu əvvəlcədən elan edir.

![nisan:5.8.1]

Bir az sonra zolaqlardan biri bitir: zolağın qurtaracağı nişanı sənə vaxtında yerini dəyişməyi xatırladır.

![nisan:5.8.5]

Sol tərəfdəki zolağın üstündə avtobus təsviri var — marşrut nəqliyyat vasitələri üçün zolaq.

![nisan:5.9]

Belə zolağı olan yolu ayrıca nişan da elan edir.

![nisan:5.10.1]

Onun sonu isə marşrut nəqliyyat vasitələri üçün zolağı olan yolun qurtaracağı nişanı ilə bildirilir.

![nisan:5.10.4]

## Geriyə dönmə yeri

Bölünmüş yolda geri qayıtmaq lazımdır. Xüsusi nişan geriyə dönmə yerini göstərir.

![nisan:5.11.1]

Uzun sahələrdə isə geriyə dönmə yerinin zonası nişanı qoyulur.

![nisan:5.11.2]

### Niyə vacibdir

Məlumat-göstərici nişanlar qadağa qoymur, amma yolun rejimini elan edir: avtomagistral, birtərəfli küçə və ya marşrut zolağı — hər birində davranış fərqlidir. Yolun növünü bilməyən sürücü qaydanı bilmədən pozur.

> **Diqqət:** Başlanğıc və qurtaracaq nişanları həmişə cüt işləyir. 5.1 ilə 5.2, 5.3 ilə 5.4, 5.5 ilə 5.6 — birincisini gördünsə, rejim ikincisini görənə qədər davam edir.

## Yekun

- 5.1 avtomagistralı, 5.2 onun qurtaracağını bildirir.
- 5.3 avtomobillər üçün yolu, 5.4 onun qurtaracağını göstərir.
- 5.5 birtərəfli yolu, 5.6 onun qurtaracağını, 5.7 qrupu isə birtərəfli yola çıxışı bildirir.
- 5.8 qrupu zolağın başlanğıcını və qurtaracağını, 5.9 və 5.10 qrupu marşrut nəqliyyatı zolağını göstərir.
- 5.11.1 geriyə dönmə yerini, 5.11.2 həmin yerin zonasını bildirir.`,
    questions: [
      { q: '5.1 nişanı nəyi bildirir?', options: ['Avtomagistralı', 'Avtomobillər üçün yolu', 'Birtərəfli yolu', 'Dalanı'], correct: 0, explanation: '5.1 nişanı avtomagistralı bildirir.' },
      { q: '5.2 nişanı nəyi bildirir?', options: ['Avtomagistralın qurtaracağını', 'Avtomagistralın başlanğıcını', 'Birtərəfli yolun sonunu', 'Zolağın sonunu'], correct: 0, explanation: '5.2 nişanı avtomagistralın qurtaracağını bildirir.' },
      { q: '5.3 nişanı nəyi bildirir?', options: ['Avtomobillər üçün yolu', 'Avtomagistralı', 'Marşrut zolağını', 'Piyada zolağını'], correct: 0, explanation: '5.3 nişanı avtomobillər üçün yolu bildirir.' },
      { q: '5.5 nişanı nəyi bildirir?', options: ['Birtərəfli yolu', 'İkitərəfli hərəkəti', 'Dalanı', 'Geriyə dönmə yerini'], correct: 0, explanation: '5.5 nişanı birtərəfli yolu bildirir.' },
      { q: '5.6 nişanı nəyi bildirir?', options: ['Birtərəfli yolun qurtaracağını', 'Birtərəfli yolun başlanğıcını', 'Avtomagistralın sonunu', 'Zolağın başlanğıcını'], correct: 0, explanation: '5.6 nişanı birtərəfli yolun qurtaracağını bildirir.' },
      { q: '5.7 qrupundakı nişanlar nəyi göstərir?', options: ['Birtərəfli hərəkət yoluna çıxışı', 'Birtərəfli yolun sonunu', 'Zolağın qurtaracağını', 'Marşrut nömrəsini'], correct: 0, explanation: '5.7.1 və 5.7.2 nişanları birtərəfli hərəkət yoluna çıxışı göstərir.' },
      { q: '5.8.1 nişanı nəyi bildirir?', options: ['Zolağın başlanğıcını', 'Zolağın qurtaracağını', 'Yolun daralmasını', 'Dalanı'], correct: 0, explanation: '5.8.1 nişanı zolağın başlanğıcını bildirir.' },
      { q: '5.8.5 nişanı nəyi bildirir?', options: ['Zolağın qurtaracağını', 'Zolağın başlanğıcını', 'Marşrut zolağını', 'Geriyə dönmə yerini'], correct: 0, explanation: '5.8.5 nişanı zolağın qurtaracağını bildirir.' },
      { q: '5.9 nişanı nəyi göstərir?', options: ['Marşrut nəqliyyat vasitələri üçün zolağı', 'Velosiped zolağını', 'Piyada zolağını', 'Duracaq yerini'], correct: 0, explanation: '5.9 nişanı marşrut nəqliyyat vasitələri üçün zolağı göstərir.' },
      { q: '5.10.1 nişanı nəyi bildirir?', options: ['Marşrut nəqliyyatı zolağı olan yolu', 'Marşrut zolağının sonunu', 'Avtomagistralı', 'Birtərəfli yolu'], correct: 0, explanation: '5.10.1 nişanı marşrut nəqliyyat vasitələri üçün zolağı olan yolu bildirir.' },
      { q: '5.10.4 nişanı nəyi bildirir?', options: ['Marşrut zolağı olan yolun qurtaracağını', 'Marşrut zolağının başlanğıcını', 'Avtomagistralın sonunu', 'Zolağın başlanğıcını'], correct: 0, explanation: '5.10.4 nişanı marşrut nəqliyyat vasitələri üçün zolağı olan yolun qurtaracağını bildirir.' },
      { q: '5.11.1 nişanı nəyi göstərir?', options: ['Geriyə dönmə yerini', 'Geriyə dönmənin qadağan olduğunu', 'Dalanı', 'Duracaq yerini'], correct: 0, explanation: '5.11.1 nişanı geriyə dönmə yerini göstərir.' },
      { q: '5.11.2 nişanı nəyi göstərir?', options: ['Geriyə dönmə yerinin zonasını', 'Geriyə dönmənin qadağan olduğu zonanı', 'Duracaq zonasını', 'Sürət zonasını'], correct: 0, explanation: '5.11.2 nişanı geriyə dönmə yerinin zonasını göstərir.' },
      { q: 'Məlumat-göstərici nişanların əsas işi nədir?', options: ['Yolun rejimi və quruluşu barədə məlumat vermək', 'Hərəkəti qadağan etmək', 'Cərimə təyin etmək', 'Yalnız təhlükə barədə xəbərdarlıq etmək'], correct: 0, explanation: 'Məlumat-göstərici nişanlar yolun növü, rejimi və quruluşu barədə məlumat verir.' },
      { q: 'Avtomagistral nişanını (5.1) gördün. Rejim nə vaxta qədər davam edir?', options: ['5.2 — avtomagistralın qurtaracağı nişanına qədər', 'Növbəti yolayrıcına qədər', 'Bir kilometr', 'Şəhərin sonuna qədər'], correct: 0, explanation: 'Başlanğıc nişanı ilə elan olunan rejim müvafiq qurtaracaq nişanına qədər davam edir.' },
    ],
  },
  {
    title: 'Məlumat-göstərici nişanlar: dayanacaq, keçid və sürət',
    codes: ['5.12', '5.13', '5.14', '5.15', '5.16.1', '5.16.2', '5.17.1', '5.17.3', '5.18', '5.19.1', '5.33'],
    content: `## Şəhər küçəsində dayanacaqlar

Şəhərin mərkəzindəki küçə ilə gedirsən. Sağ tərəfdə avtobus təsvirli mavi nişan var — avtobusun və ya trolleybusun dayanacaq yeri. Burada sərnişin minib-düşür, ona görə də ətrafda piyada hərəkəti sıxdır.

![nisan:5.12]

Bir qədər irəlidə tramvay təsvirli nişan tramvayın dayanacaq yerini göstərir.

![nisan:5.13]

Meydanın kənarında minik taksilərinin dayanacaq yeri nişanı var.

![nisan:5.14]

Nəhayət, maşını qoymaq üçün lazım olan nişan: duracaq yeri. Mavi fonda böyük "P" hərfi.

![nisan:5.15]

## Piyada keçidləri

Küçənin ortasında mavi kvadratın içində piyada təsviri görünür — piyada keçidi nişanı. Bu, xəbərdarlıq nişanı olan 1.20-dən fərqlidir: 1.20 keçidin qarşıda olduğunu bildirir, 5.16 isə keçidin məhz burada olduğunu göstərir.

![nisan:5.16.1]

![nisan:5.16.2]

Sıx nəqliyyatın olduğu yerdə piyadalar yolun altından keçir — yeraltı piyada keçidi.

![nisan:5.17.1]

Bəzi yerlərdə isə keçid yolun üstündən qurulur: yerüstü piyada keçidi.

![nisan:5.17.3]

## Tövsiyə və stop-xətt

Təhlükəli sahəyə yaxınlaşanda mavi fonda rəqəm görünür — tövsiyə edilən sürət. Bu, qadağa deyil: yolun bu hissəsi üçün təhlükəsiz sayılan sürətdir.

![nisan:5.18]

Yolayrıcında yol örtüyünə çəkilmiş eninə xətt və onu bildirən nişan var — stop-xətt. Dayanmaq lazım gələndə maşını məhz bu xəttin qarşısında saxlayırsan.

![nisan:5.33]

Küçələrdən biri isə dalandır — çıxışı yoxdur, oraya girsən, geri qayıtmalı olacaqsan.

![nisan:5.19.1]

### Niyə vacibdir

Bu nişanlar gündəlik şəhər sürücülüyünün yarısını təşkil edir: harada dayanmaq olar, harada piyada gözləmək lazımdır, hansı küçə çıxışsızdır. Onlar qadağa qoymur, amma onları oxumayan sürücü hər gün vaxt itirir və başqalarına maneə yaradır.

> **Diqqət:** 1.20 və 5.16 nişanlarını qarışdırma. Üçbucaqlı 1.20 "qarşıda piyada keçidi var" deyir — hazırlaş. Kvadrat 5.16 isə "piyada keçidi buradadır" deyir.

## Yekun

- 5.12 avtobus/trolleybus, 5.13 tramvay, 5.14 minik taksisi dayanacağını göstərir.
- 5.15 duracaq yerini bildirir.
- 5.16 piyada keçidinin özünü, 5.17 qrupu yeraltı və yerüstü keçidləri göstərir.
- 5.18 tövsiyə edilən sürətdir — qadağa deyil.
- 5.33 stop-xətti, 5.19 qrupu isə dalanı bildirir.`,
    questions: [
      { q: '5.12 nişanı nəyi göstərir?', options: ['Avtobusun və ya trolleybusun dayanacaq yerini', 'Tramvayın dayanacaq yerini', 'Taksi dayanacağını', 'Duracaq yerini'], correct: 0, explanation: '5.12 nişanı avtobusun və ya trolleybusun dayanacaq yerini göstərir.' },
      { q: '5.13 nişanı nəyi göstərir?', options: ['Tramvayın dayanacaq yerini', 'Avtobus dayanacağını', 'Taksi dayanacağını', 'Dəmir yol keçidini'], correct: 0, explanation: '5.13 nişanı tramvayın dayanacaq yerini göstərir.' },
      { q: '5.14 nişanı nəyi göstərir?', options: ['Minik taksilərinin dayanacaq yerini', 'Avtobus dayanacağını', 'Duracaq yerini', 'Yanacaqdoldurma məntəqəsini'], correct: 0, explanation: '5.14 nişanı minik taksilərinin dayanacaq yerini göstərir.' },
      { q: '5.15 nişanı nəyi göstərir?', options: ['Duracaq yerini', 'Taksi dayanacağını', 'Avtobus dayanacağını', 'Dincəlmə yerini'], correct: 0, explanation: '5.15 nişanı duracaq yerini göstərir.' },
      { q: '5.16 nişanı ilə 1.20 nişanı arasındakı fərq nədir?', options: ['5.16 keçidin özünü, 1.20 qarşıda keçid olduğunu bildirir', '5.16 qarşıda keçid olduğunu bildirir', 'İkisi də eynidir', '1.20 yalnız şəhərdə qoyulur'], correct: 0, explanation: '1.20 xəbərdarlıq nişanıdır — qarşıda piyada keçidi var; 5.16 isə keçidin məhz o yerdə olduğunu göstərir.' },
      { q: '5.17.1 nişanı nəyi göstərir?', options: ['Yeraltı piyada keçidini', 'Yerüstü piyada keçidini', 'Adi piyada keçidini', 'Piyada zolağını'], correct: 0, explanation: '5.17.1 nişanı yeraltı piyada keçidini göstərir.' },
      { q: '5.17.3 nişanı nəyi göstərir?', options: ['Yerüstü piyada keçidini', 'Yeraltı piyada keçidini', 'Piyada zolağını', 'Dalanı'], correct: 0, explanation: '5.17.3 nişanı yerüstü piyada keçidini göstərir.' },
      { q: '5.18 nişanı nəyi bildirir?', options: ['Tövsiyə edilən sürəti', 'Maksimum sürəti', 'Minimum sürəti', 'Sürət zonasının sonunu'], correct: 0, explanation: '5.18 nişanı tövsiyə edilən sürəti bildirir.' },
      { q: '5.18 nişanı qadağa qoyurmu?', options: ['Xeyr — tövsiyə xarakteri daşıyır', 'Bəli, sürəti məhdudlaşdırır', 'Bəli, dayanmağı qadağan edir', 'Bəli, ötməyi qadağan edir'], correct: 0, explanation: '5.18 tövsiyə edilən sürətdir — yolun həmin hissəsi üçün təhlükəsiz sayılan sürəti göstərir.' },
      { q: '5.33 nişanı nəyi göstərir?', options: ['Stop-xətti', 'Piyada keçidini', 'Duracaq yerini', 'Dalanı'], correct: 0, explanation: '5.33 nişanı stop-xətti göstərir.' },
      { q: '5.19 qrupundakı nişan nəyi bildirir?', options: ['Dalanı — çıxışı olmayan yolu', 'Birtərəfli yolu', 'Geriyə dönmə yerini', 'Avtomagistralı'], correct: 0, explanation: '5.19 qrupundakı nişanlar dalanı — çıxışı olmayan yolu bildirir.' },
      { q: 'Avtobus dayanacağının (5.12) yanında niyə xüsusi diqqət lazımdır?', options: ['Orada sərnişin minib-düşür, piyada hərəkəti sıxdır', 'Orada sürət həddi yoxdur', 'Orada ötmək məcburidir', 'Orada nişanlar qüvvədən düşür'], correct: 0, explanation: 'Dayanacaqda sərnişinlər minib-düşdüyü üçün ətrafda piyada hərəkəti sıx olur.' },
      { q: 'Dalan nişanını (5.19) görəndə nə etmək məntiqlidir?', options: ['Oraya girməmək, çünki çıxış yoxdur', 'Sürəti artırmaq', 'Dayanmaq', 'Geriyə dönməmək'], correct: 0, explanation: 'Dalan çıxışı olmayan yoldur — oraya girən sürücü geri qayıtmalı olur.' },
      { q: 'Stop-xətt nişanı (5.33) sürücüyə nə deyir?', options: ['Dayanmaq lazım gələndə maşını bu xəttin qarşısında saxla', 'Burada həmişə dayan', 'Burada dayanmaq qadağandır', 'Burada sürəti artır'], correct: 0, explanation: '5.33 nişanı dayanma tələb olunan yerdə maşının saxlanacağı xətti göstərir.' },
      { q: 'Duracaq yeri nişanının (5.15) üzərində hansı hərf var?', options: ['P', 'S', 'T', 'A'], correct: 0, explanation: 'Duracaq yeri nişanı mavi fonda ağ "P" hərfi ilə göstərilir.' },
    ],
  },
  {
    title: 'Məlumat-göstərici nişanlar: istiqamət və marşrut göstəriciləri',
    codes: ['5.20.1', '5.20.2', '5.20.3', '5.21.1', '5.21.2', '5.26-1', '5.27', '5.28', '5.29.1-1', '5.30.1', '5.31', '5.34.1', '5.38'],
    content: `## Yolayrıcına yaxınlaşma

Şəhərlərarası yolla gedirsən və yolayrıcı hələ görünmür, amma yolun üstündə böyük yaşıl lövhə artıq asılıb: istiqamətlərin ilkin göstəricisi. O, hansı zolağın hara apardığını əvvəlcədən elan edir ki, sən vaxtında zolaq dəyişəsən.

![nisan:5.20.1]

Bəzi yerlərdə tək bir istiqamətin ilkin göstəricisi qoyulur.

![nisan:5.20.2]

Mürəkkəb yolayrıclarında isə hərəkət sxemi nişanı bütün icazə verilən istiqamətləri bir şəkildə göstərir.

![nisan:5.20.3]

Yolayrıcının özündə istiqamət göstəriciləri hansı yolun hara getdiyini bildirir.

![nisan:5.21.1]

![nisan:5.21.2]

## Məsafə və nömrələr

Yolayrıcını keçdikdən sonra yaşıl lövhə qarşıdakı məntəqələrə qədər olan məsafələri göstərir — məsafələr göstəricisi.

![nisan:5.27]

Yolun kənarındakı kiçik lövhələr isə kilometr göstəricisidir: qəza baş verərsə, yerini məhz bu rəqəmlə deyirsən.

![nisan:5.28]

Yolun öz nömrəsi də var — marşrut nömrəsi nişanı onu göstərir.

![nisan:5.29.1-1]

Yük avtomobilləri üçün ayrıca marşrut nişanları qoyulur: yük avtomobilləri üçün hərəkət istiqaməti.

![nisan:5.30.1]

Obyektin adını bildirən lövhələr də bu qrupdandır.

![nisan:5.26-1]

## Yol bağlıdırsa

Qarşıdakı sahə təmirə bağlanıb. Kənardankeçmə sxemi nişanı bağlı sahənin necə keçiləcəyini göstərir.

![nisan:5.31]

Bəzi yerlərdə isə hərəkət başqa işlək hissəyə keçirilir — bunu başqa işlək hissəyə yerdəyişmənin ilkin göstəricisi elan edir.

![nisan:5.34.1]

Şəhərə çatanda küçənin istiqaməti nişanı hansı küçənin hara apardığını göstərir.

![nisan:5.38]

### Niyə vacibdir

İstiqamət göstəriciləri sürücünü vaxtında qərar verməyə hazırlayır. Yolayrıcının üstündə zolaq dəyişmək təhlükəlidir; ilkin göstərici məhz buna görə yolayrıcından xeyli əvvəl qoyulur — qərarını hələ sərbəst zolaqda ikən verirsən.

> **Diqqət:** Kilometr göstəricisi (5.28) sadəcə rəqəm deyil. Yolda qəza və ya nasazlıq zamanı yerini dəqiq demək üçün ən sürətli yol məhz həmin rəqəmdir.

## Yekun

- 5.20 qrupu yolayrıcından əvvəl istiqamətləri və hərəkət sxemini elan edir.
- 5.21 qrupu yolayrıcında istiqamət göstəriciləridir.
- 5.27 məsafələri, 5.28 kilometri, 5.29 marşrut nömrəsini göstərir.
- 5.30 yük avtomobilləri üçün istiqaməti, 5.26 obyektin adını bildirir.
- 5.31 kənardankeçmə sxemini, 5.34 başqa işlək hissəyə yerdəyişməni, 5.38 küçənin istiqamətini göstərir.`,
    questions: [
      { q: '5.20 qrupundakı nişanlar nə vaxt qoyulur?', options: ['Yolayrıcından əvvəl — istiqamətləri əvvəlcədən elan etmək üçün', 'Yolayrıcından sonra', 'Yalnız şəhər mərkəzində', 'Yalnız avtomagistralın sonunda'], correct: 0, explanation: '5.20 qrupu istiqamətlərin ilkin göstəricisidir — yolayrıcından əvvəl qoyulur.' },
      { q: '5.20.3 nişanı nəyi göstərir?', options: ['Hərəkət sxemini', 'Məsafələri', 'Marşrut nömrəsini', 'Küçənin adını'], correct: 0, explanation: '5.20.3 nişanı hərəkət sxemini göstərir.' },
      { q: '5.21 qrupundakı nişanlar nədir?', options: ['İstiqamət göstəriciləri', 'Məsafələr göstəricisi', 'Kilometr göstəricisi', 'Kənardankeçmə sxemi'], correct: 0, explanation: '5.21.1 və 5.21.2 istiqamət göstəriciləridir.' },
      { q: '5.27 nişanı nəyi göstərir?', options: ['Məsafələri', 'Kilometri', 'Marşrut nömrəsini', 'Obyektin adını'], correct: 0, explanation: '5.27 nişanı məsafələr göstəricisidir.' },
      { q: '5.28 nişanı nəyi göstərir?', options: ['Kilometr göstəricisini', 'Məsafələr göstəricisini', 'Marşrut nömrəsini', 'Hərəkət sxemini'], correct: 0, explanation: '5.28 nişanı kilometr göstəricisidir.' },
      { q: 'Yolda qəza baş verib. Yerini ən dəqiq necə deyə bilərsən?', options: ['Kilometr göstəricisindəki (5.28) rəqəmlə', 'Marşrut nömrəsi ilə', 'Küçənin adı ilə', 'Yaxınlıqdakı obyektin rənginə görə'], correct: 0, explanation: 'Kilometr göstəricisi yoldakı dəqiq mövqeyi bildirir.' },
      { q: '5.29 qrupundakı nişan nəyi göstərir?', options: ['Marşrut nömrəsini', 'Sürət həddini', 'Məsafəni', 'Küçənin istiqamətini'], correct: 0, explanation: '5.29 qrupundakı nişanlar marşrut nömrəsini göstərir.' },
      { q: '5.30 qrupundakı nişanlar kimə aiddir?', options: ['Yük avtomobillərinə', 'Velosipedçilərə', 'Piyadalara', 'Taksilərə'], correct: 0, explanation: '5.30 qrupu yük avtomobilləri üçün hərəkət istiqamətini göstərir.' },
      { q: '5.31 nişanı nəyi göstərir?', options: ['Kənardankeçmə sxemini', 'Hərəkət sxemini', 'Marşrut nömrəsini', 'Duracaq yerini'], correct: 0, explanation: '5.31 nişanı kənardankeçmə sxemini göstərir.' },
      { q: '5.34 qrupundakı nişan nəyi bildirir?', options: ['Başqa işlək hissəyə yerdəyişməni', 'Yolun sonunu', 'Zolağın başlanğıcını', 'Dalanı'], correct: 0, explanation: '5.34.1 və 5.34.2 başqa işlək hissəyə yerdəyişmənin ilkin göstəricisidir.' },
      { q: '5.38 nişanı nəyi göstərir?', options: ['Küçənin istiqamətini', 'Küçənin uzunluğunu', 'Küçədəki sürət həddini', 'Küçədəki duracaqları'], correct: 0, explanation: '5.38 nişanı küçənin istiqamətini göstərir.' },
      { q: '5.26 qrupundakı lövhə nəyi bildirir?', options: ['Obyektin adını', 'Yolun nömrəsini', 'Məsafəni', 'Sürət həddini'], correct: 0, explanation: '5.26-1 və 5.26-2 lövhələri obyektin adını bildirir.' },
      { q: 'İlkin göstərici nişanı niyə yolayrıcından xeyli əvvəl qoyulur?', options: ['Sürücü zolağını sərbəst şəraitdə dəyişə bilsin deyə', 'Yolayrıcında yer olmadığı üçün', 'Yalnız gecə görünsün deyə', 'Piyadalar üçün'], correct: 0, explanation: 'İlkin göstərici sürücüyə vaxtında zolaq dəyişmək imkanı verir — yolayrıcının üstündə manevr təhlükəlidir.' },
      { q: 'Yol təmirə görə bağlanıbsa, hansı nişan yolu göstərir?', options: ['5.31 — kənardankeçmə sxemi', '5.27 — məsafələr göstəricisi', '5.28 — kilometr göstəricisi', '5.38 — küçənin istiqaməti'], correct: 0, explanation: 'Kənardankeçmə sxemi bağlanmış sahənin necə keçiləcəyini göstərir.' },
    ],
  },
  {
    title: 'Servis nişanları: yolda kömək və rahatlıq',
    codes: ['6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8', '6.9', '6.10', '6.11', '6.12', '6.13', '6.14', '6.15', '6.16'],
    content: `## Uzun yolda mavi lövhələr

Uzun səfərdəsən və yolun kənarında mavi haşiyəli düzbucaqlı lövhələr bir-birini əvəz edir. Bunlar servis nişanlarıdır: yollarda müvafiq obyektlərin yerləşməsi barədə məlumat verir. Onların düzbucaq forması, enli mavi haşiyəsi var və müvafiq rəmzlər ağ fon üzərində təsvir olunur.

Birinci lövhədə qırmızı xaç var — ilk tibbi yardım məntəqəsi.

![nisan:6.1]

Onun yanında xəstəxana nişanı dayanır.

![nisan:6.2]

Yanacaq göstəricisi aşağı düşüb, amma narahat olmağa dəyməz: yanacaqdoldurma məntəqəsi nişanı görünür.

![nisan:6.3]

Maşında qəribə səs var. Avtomobillərə texniki xidmət nişanı sənə yaxınlıqdakı ustanı göstərir.

![nisan:6.4]

Palçıqlı yoldan sonra avtomobillərin yuyulma məntəqəsi lazım olur.

![nisan:6.5]

## Dayan, dincəl, davam et

Telefon nişanı rabitə nöqtəsini göstərir.

![nisan:6.6]

Yeməkxana nişanı ac sürücü üçün ən yaxşı xəbərdir.

![nisan:6.7]

İçməli su nişanı su götürmək mümkün olan yeri bildirir.

![nisan:6.8]

Gecə yolda qalmaq istəmirsənsə, mehmanxana və ya motel nişanına diqqət et.

![nisan:6.9]

Çadırla səyahət edənlər üçün kempinq nişanı var.

![nisan:6.10]

Sadəcə bir neçə dəqiqə dayanmaq üçün isə dincəlmə yeri nişanı.

![nisan:6.11]

## Nəzarət və məlumat

Yolun kənarında yol polisinin daimi məntəqəsi nişanı görünür.

![nisan:6.12]

Şəhərə girəndə polis hissəsi nişanı var.

![nisan:6.13]

Böyük dayanacaqda informasiya stendi nişanı yerləşdirilib.

![nisan:6.14]

Yanında tualet nişanı.

![nisan:6.15]

Dənizə yaxınlaşanda isə çimərlik nişanı görünür.

![nisan:6.16]

### Niyə vacibdir

Servis nişanları qayda qoymur, amma uzun səfərdə təhlükəsizliyin bir hissəsidir: yorğun sürücünün dincəlmə yerini vaxtında görməsi, yanacağın bitməzdən əvvəl doldurulması və xəstəxananın yerini bilmək real hadisələrin qarşısını alır.

Servis nişanları yaşayış məntəqələrində bilavasitə obyektlərin yanında və ya onlara dönəcək yerlərdə quraşdırılır. Yaşayış məntəqələrindən kənar yollarda isə nişanlar obyektdən 60—80 kilometr, 15—20 km və 400—800 metr aralıda əvvəlcədən quraşdırılır. Yaşayış məntəqələrinin yollarında onları obyektlərdən 100—150 metr aralı məsafədə və onlara yaxın dönəcək yerlərdə quraşdırırlar.

> **Diqqət:** Servis nişanını gördüyün yer obyektin özü demək deyil. Şəhərdənkənar yolda nişan obyektdən 60—80 km əvvəl də qoyula bilər — məsafəni lövhədəki göstəricidən oxu.

## Yekun

- Servis nişanları düzbucaq formalı, enli mavi haşiyəlidir; rəmzlər ağ fon üzərindədir.
- 6.1 ilk tibbi yardım, 6.2 xəstəxana, 6.3 yanacaqdoldurma məntəqəsidir.
- 6.4 texniki xidmət, 6.5 yuyulma məntəqəsi, 6.6 telefondur.
- 6.7 yeməkxana, 6.8 içməli su, 6.9 mehmanxana, 6.10 kempinq, 6.11 dincəlmə yeridir.
- 6.12 yol polisinin daimi məntəqəsi, 6.13 polis hissəsi, 6.14 informasiya stendi, 6.15 tualet, 6.16 çimərlikdir.`,
    questions: [
      { q: 'Servis nişanları hansı formadadır?', options: ['Enli mavi haşiyəli düzbucaqlı', 'Qırmızı haşiyəli dairə', 'Sarı romb', 'Ağ üçbucaq'], correct: 0, explanation: 'Servis nişanlarının düzbucaq forması və enli mavi haşiyəsi var, rəmzlər ağ fon üzərində təsvir olunur.' },
      { q: '6.1 nişanı nəyi göstərir?', options: ['İlk tibbi yardım məntəqəsini', 'Xəstəxananı', 'Aptek şəbəkəsini', 'Polis hissəsini'], correct: 0, explanation: '6.1 nişanı ilk tibbi yardım məntəqəsini göstərir.' },
      { q: '6.2 nişanı nəyi göstərir?', options: ['Xəstəxananı', 'İlk tibbi yardım məntəqəsini', 'Yeməkxananı', 'Moteli'], correct: 0, explanation: '6.2 nişanı xəstəxananı göstərir.' },
      { q: '6.3 nişanı nəyi göstərir?', options: ['Yanacaqdoldurma məntəqəsini', 'Texniki xidməti', 'Yuyulma məntəqəsini', 'Dincəlmə yerini'], correct: 0, explanation: '6.3 nişanı yanacaqdoldurma məntəqəsini göstərir.' },
      { q: '6.4 nişanı nəyi göstərir?', options: ['Avtomobillərə texniki xidməti', 'Yanacaqdoldurma məntəqəsini', 'Avtomobillərin yuyulmasını', 'Kempinqi'], correct: 0, explanation: '6.4 nişanı avtomobillərə texniki xidmət obyektini göstərir.' },
      { q: '6.5 nişanı nəyi göstərir?', options: ['Avtomobillərin yuyulma məntəqəsini', 'Texniki xidməti', 'İçməli suyu', 'Çimərliyi'], correct: 0, explanation: '6.5 nişanı avtomobillərin yuyulma məntəqəsini göstərir.' },
      { q: '6.8 nişanı nəyi göstərir?', options: ['İçməli suyu', 'Avtomobil yuyulmasını', 'Çimərliyi', 'Yeməkxananı'], correct: 0, explanation: '6.8 nişanı içməli su olan yeri göstərir.' },
      { q: '6.9 nişanı nəyi göstərir?', options: ['Mehmanxana və ya moteli', 'Kempinqi', 'Dincəlmə yerini', 'Yeməkxananı'], correct: 0, explanation: '6.9 nişanı mehmanxana və ya moteli göstərir.' },
      { q: '6.10 nişanı nəyi göstərir?', options: ['Kempinqi', 'Moteli', 'Dincəlmə yerini', 'Çimərliyi'], correct: 0, explanation: '6.10 nişanı kempinqi göstərir.' },
      { q: '6.11 nişanı nəyi göstərir?', options: ['Dincəlmə yerini', 'Kempinqi', 'Duracaq yerini', 'İnformasiya stendini'], correct: 0, explanation: '6.11 nişanı dincəlmə yerini göstərir.' },
      { q: '6.12 nişanı nəyi göstərir?', options: ['Yol polisinin daimi məntəqəsini', 'Polis hissəsini', 'Gömrükxananı', 'İnformasiya stendini'], correct: 0, explanation: '6.12 nişanı yol polisinin daimi məntəqəsini göstərir.' },
      { q: '6.13 nişanı nəyi göstərir?', options: ['Polis hissəsini', 'Yol polisinin daimi məntəqəsini', 'Xəstəxananı', 'Tualeti'], correct: 0, explanation: '6.13 nişanı polis hissəsini göstərir.' },
      { q: 'Yaşayış məntəqələrindən kənar yollarda servis nişanları obyektdən hansı məsafələrdə quraşdırılır?', options: ['60—80 km, 15—20 km və 400—800 metr aralıda', 'Yalnız 100 metr aralıda', 'Yalnız obyektin yanında', '1 km və 2 km aralıda'], correct: 0, explanation: 'Yaşayış məntəqələrindən kənar yollarda servis nişanları obyektdən 60—80 km, 15—20 km və 400—800 metr aralıda quraşdırılır.' },
      { q: 'Yaşayış məntəqələrinin yollarında servis nişanları hansı məsafədə quraşdırılır?', options: ['Obyektlərdən 100—150 metr aralı və dönəcək yerlərində', '60—80 km aralıda', 'Yalnız şəhərin girişində', '500 metr aralıda'], correct: 0, explanation: 'Yaşayış məntəqələrinin yollarında nişanlar obyektlərdən 100—150 metr aralı məsafədə və onlara yaxın dönəcək yerlərdə quraşdırılır.' },
      { q: 'Servis nişanları hansı funksiyanı daşıyır?', options: ['Yollarda müvafiq obyektlərin yerləşməsi barədə məlumat verir', 'Hərəkəti qadağan edir', 'Sürət həddini müəyyən edir', 'Üstünlük qaydasını müəyyən edir'], correct: 0, explanation: 'Servis nişanları yollarda müvafiq obyektlərin yerləşməsi barədə məlumat verir.' },
    ],
  },
  {
    title: 'Nişanlar cütlükdə: başlanğıc və qurtaracaq',
    codes: ['3.20', '3.21', '3.22', '3.23', '3.24', '3.25', '3.31', '4.7', '4.8', '5.1', '5.2', '5.5', '5.6', '5.22', '5.23', '5.35', '5.36'],
    content: `## Bir nişan başlayır, digəri bitirir

Şəhərdən çıxıb uzun bir marşruta başlayırsan və bu dəfə nişanlara tək-tək yox, cüt-cüt baxırsan. Yol nişanlarının böyük bir hissəsi cütlükdə işləyir: biri rejimi başladır, digəri onu bitirir. Birinci nişanı görüb ikincisini gözləməyi bilmək — nişanları oxumağın ikinci mərhələsidir.

Şəhərin girişində yaşayış məntəqəsinin başlanğıcı nişanı var: buradan etibarən şəhər qaydaları qüvvəyə minir.

![nisan:5.22]

Şəhəri tərk edəndə isə onun cütü — yaşayış məntəqəsinin qurtaracağı.

![nisan:5.23]

Magistrala qalxanda avtomagistral nişanı rejimi elan edir.

![nisan:5.1]

Onun cütü avtomagistralın qurtaracağıdır.

![nisan:5.2]

## Qadağa da cütlüklə gəlir

Dolanbac sahədə ötmək qadağandır nişanı qoyulub — bütün nəqliyyat vasitələrinə ötmək qadağandır.

![nisan:3.20]

Sahə bitəndə ötməyin qadağan edildiyi zonanın qurtaracağı nişanı qadağanı götürür.

![nisan:3.21]

Yük avtomobilləri üçün ayrıca cütlük var: 3.22 icazə verilən maksimum kütləsi 3,5 tondan artıq olan yük avtomobillərinə bütün nəqliyyat vasitələrini ötməyi qadağan edir.

![nisan:3.22]

Onun qurtaracağını 3.23 bildirir.

![nisan:3.23]

Sürətdə də eyni məntiq işləyir: maksimum sürətin məhdudlaşdırılması.

![nisan:3.24]

Və onun qurtaracağı.

![nisan:3.25]

Minimum sürət də cütlüklə gəlir — 4.7 başladır, 4.8 bitirir.

![nisan:4.7]

![nisan:4.8]

## Bir neçə qadağa eyni anda

Bəzən bir sahədə eyni vaxtda bir neçə nişan qüvvədə olur: məsələn, həm sürət həddi, həm ötmə qadağası. Belə sahənin sonunda hər qadağa üçün ayrıca nişan qoymaq əvəzinə tək bir nişan işlədilir — bütün məhdudiyyətlər zonasının qurtaracağı. O, eyni vaxtda bir neçə nişanın qüvvədə olduğu sahənin bitməsini bildirir.

![nisan:3.31]

## Qarşılıqlı hərəkət

Dar sahələrdə qarşılıqlı hərəkət rejimi tətbiq olunur və onun da öz cütü var: 5.35 rejimi başladır.

![nisan:5.35]

5.36 isə qarşılıqlı hərəkətin qurtaracağını bildirir.

![nisan:5.36]

Birtərəfli yolda da eyni məntiq var: 5.5 başlanğıc, 5.6 qurtaracaqdır.

![nisan:5.5]

![nisan:5.6]

### Niyə vacibdir

Cütlük məntiqini bilməyən sürücü iki səhvdən birini edir: ya qadağanı vaxtından əvvəl unudur (qurtaracaq nişanını görmədən sürəti artırır), ya da artıq bitmiş rejimi kilometrlərlə daşıyır. Nişanı görəndə "bu nə vaxt bitəcək" sualını vermək vərdişə çevrilməlidir.

> **Diqqət:** Bir sahədə bir neçə məhdudiyyət varsa, 3.31 hamısını birdən bitirir. Amma tək bir qadağanın öz şəxsi qurtaracaq nişanı varsa (3.21, 3.23, 3.25), o, yalnız özünə aid qadağanı götürür.

## Yekun

- 5.22/5.23, 5.1/5.2, 5.5/5.6, 5.35/5.36 — başlanğıc və qurtaracaq cütlükləridir.
- 3.20/3.21 ötmə qadağasını, 3.22/3.23 yük avtomobillərinin ötmə qadağasını başladıb bitirir.
- 3.24/3.25 maksimum sürət, 4.7/4.8 isə minimum sürət cütlüyüdür.
- 3.31 eyni vaxtda qüvvədə olan bir neçə məhdudiyyətin hamısını bitirir.
- Hər nişanı görəndə onun cütünü — yəni rejimin harada bitəcəyini — gözləmək lazımdır.`,
    questions: [
      { q: '3.20 nişanının qadağasını hansı nişan götürür?', options: ['3.21', '3.25', '3.31', '3.23'], correct: 0, explanation: '3.21 ötməyin qadağan edildiyi zonanın qurtaracağını bildirir.' },
      { q: '3.22 nişanının qadağasını hansı nişan bitirir?', options: ['3.23', '3.21', '3.25', '3.31'], correct: 0, explanation: '3.23 yük avtomobillərinin ötməsi qadağan edilmiş zonanın qurtaracağıdır.' },
      { q: '3.24 nişanının təsirini hansı nişan bitirir?', options: ['3.25', '3.21', '4.8', '5.2'], correct: 0, explanation: '3.25 maksimum sürətin məhdudlaşdırıldığı zonanın qurtaracağını bildirir.' },
      { q: '4.7 nişanının təsirini hansı nişan bitirir?', options: ['4.8', '3.25', '3.31', '5.6'], correct: 0, explanation: '4.8 minimum sürətin məhdudlaşdırıldığı zonanın qurtaracağıdır.' },
      { q: '3.31 nişanı nə edir?', options: ['Eyni vaxtda qüvvədə olan bir neçə məhdudiyyəti bitirir', 'Yalnız sürət həddini bitirir', 'Yalnız ötmə qadağasını bitirir', 'Yeni məhdudiyyət başladır'], correct: 0, explanation: '3.31 eyni vaxtda bir neçə nişanın qüvvədə olduğu sahənin bitməsini bildirir.' },
      { q: '5.1 nişanının cütü hansıdır?', options: ['5.2', '5.6', '5.23', '5.36'], correct: 0, explanation: '5.2 avtomagistralın qurtaracağını bildirir.' },
      { q: '5.5 nişanının cütü hansıdır?', options: ['5.6', '5.2', '5.23', '3.21'], correct: 0, explanation: '5.6 birtərəfli yolun qurtaracağını bildirir.' },
      { q: '5.22 nişanının cütü hansıdır?', options: ['5.23', '5.2', '5.6', '5.36'], correct: 0, explanation: '5.23 yaşayış məntəqəsinin qurtaracağını bildirir.' },
      { q: '5.35 nişanının cütü hansıdır?', options: ['5.36', '5.6', '5.23', '3.31'], correct: 0, explanation: '5.36 qarşılıqlı hərəkətin qurtaracağını bildirir.' },
      { q: 'Sahədə həm sürət həddi, həm ötmə qadağası var və sonda yalnız 3.31 nişanı dayanır. Nə baş verir?', options: ['Hər iki məhdudiyyət bitir', 'Yalnız sürət həddi bitir', 'Yalnız ötmə qadağası bitir', 'Heç nə dəyişmir'], correct: 0, explanation: '3.31 eyni vaxtda qüvvədə olan bütün məhdudiyyətlərin bitdiyini bildirir.' },
      { q: '3.21 nişanı sürət həddini də götürürmü?', options: ['Xeyr — yalnız ötmə qadağasını götürür', 'Bəli, bütün məhdudiyyətləri götürür', 'Bəli, yalnız sürəti götürür', 'Yalnız yük maşınları üçün götürür'], correct: 0, explanation: '3.21 yalnız ötməyin qadağan edildiyi zonanın qurtaracağını bildirir; bütün məhdudiyyətləri 3.31 bitirir.' },
      { q: '3.22 nişanı kimə aiddir?', options: ['İcazə verilən maksimum kütləsi 3,5 tondan artıq olan yük avtomobillərinə', 'Bütün nəqliyyat vasitələrinə', 'Yalnız avtobuslara', 'Yalnız minik avtomobillərinə'], correct: 0, explanation: '3.22 icazə verilən maksimum kütləsi 3,5 tondan artıq olan yük avtomobillərinə bütün nəqliyyat vasitələrini ötməyi qadağan edir.' },
      { q: 'Nişanı görəndə hansı sual vərdişə çevrilməlidir?', options: ['"Bu rejim harada bitəcək?"', '"Bu nişan neçə ildir buradadır?"', '"Bu nişanı kim qoyub?"', '"Bu nişan hansı rəngdədir?"'], correct: 0, explanation: 'Başlanğıc nişanını görən sürücü onun qurtaracaq nişanını gözləməlidir.' },
      { q: '5.23 nişanını gördükdən sonra hansı qaydalar dəyişir?', options: ['Yaşayış məntəqəsi qaydalarının qüvvəsi bitir', 'Avtomagistral rejimi başlayır', 'Ötmək qadağan olunur', 'Sürət həddi sıfırlanır'], correct: 0, explanation: '5.23 yaşayış məntəqəsinin qurtaracağını bildirir — məntəqə qaydalarının qüvvəsi bitir.' },
      { q: '3.20 nişanı kimlərə ötməyi qadağan edir?', options: ['Bütün nəqliyyat vasitələrinə', 'Yalnız yük avtomobillərinə', 'Yalnız avtobuslara', 'Yalnız motosikletlərə'], correct: 0, explanation: '3.20 nişanı bütün nəqliyyat vasitələrinə ötməyi qadağan edir.' },
    ],
  },
  {
    title: 'İki və daha çox nişan bir yerdə: yolayrıcı və keçid',
    codes: ['5.39', '2.1', '2.4', '2.5', '3.29', '3.30', '1.1', '1.3.2', '1.4.1', '5.33', '3.28'],
    content: `## Yolayrıcından əvvəl: nişan nişandan xəbər verir

Sıx şəhər yolunda yolayrıcına yaxınlaşırsan və qarşındakı lövhə qeyri-adidir: onun üzərində başqa nişanların təsviri var. Bu, kəsişmə yoluna xəbərdaredici və ya qadağanedici nişanlar lövhəsidir — kəsişən yolda hansı nişanların qüvvədə olduğunu əvvəlcədən göstərir.

![nisan:5.39]

Yəni hələ dönməmişdən əvvəl bilirsən ki, o yolda səni nə gözləyir. Bu, nişanların birlikdə işləməsinin ən aydın nümunəsidir: bir nişan başqa nişanların məzmununu daşıyır.

Yolayrıcının özündə üstünlük nişanı var — baş yol.

![nisan:2.1]

Yan yoldan çıxanlar üçün isə "Yol ver" nişanı qoyulub. İki nişan birlikdə bir mənzərə yaradır: kimin keçəcəyi əvvəlcədən həll olunub.

![nisan:2.4]

Başqa bir yolayrıcında "Dayanmadan keçmək qadağandır" nişanı ilə stop-xətt birlikdə işləyir: sürücü stop-xətt qarşısında, bu xətt olmadıqda isə hərəkət hissələrinin kəsişmə xətti qarşısında dayanmalıdır.

![nisan:2.5]

![nisan:5.33]

Sürücü kəsişən yola yaxınlaşarkən 7.13 lövhəsini gördükdə baş yolla hərəkət edən nəqliyyat vasitəsinə yol verməlidir — yəni nişanın altındakı lövhə nişanın mənasını dəqiqləşdirir.

## Küçənin iki tərəfi: tək və cüt günlər

Dar küçədə iki nişan bir-birinin üzünə baxır. Ayın tək günlərində durmaq qadağandır nişanı bir tərəfdə...

![nisan:3.29]

...ayın cüt günlərində durmaq qadağandır nişanı isə digər tərəfdə dayanır.

![nisan:3.30]

Bu iki nişan yolun hərəkət hissəsinin solunda və sağında eyni vaxtda və eyni səviyyədə tətbiq edilərsə, onların təsiri sahələrində saat 19:00-dan 21:00-a kimi (yerdəyişmə zamanı) durmağa icazə verilir. Tək nişan bu qaydanı yarada bilməzdi — qayda məhz cütlükdən doğur.

Durma qadağası bəzən yol nişanlanma xətti ilə birlikdə də tətbiq olunur: duracağın qadağan olunduğu yerləri bildirən xətt müstəqil və ya 3.28 nişanı ilə birlikdə işləyə bilər.

![nisan:3.28]

## Dəmir yol keçidi: üç nişan bir səhnədə

Şəhərdən çıxanda dəmir yol keçidi görünür və orada nişanlar dəstə ilə işləyir. Əvvəlcə şlaqbaumlu dəmir yol keçidi barədə xəbərdarlıq.

![nisan:1.1]

Sonra çoxxətli dəmir yolu nişanı — relslər birdən çoxdur.

![nisan:1.3.2]

Və maili zolaqlı yaxınlaşma nişanları məsafəni sayır.

![nisan:1.4.1]

Üçü birlikdə tam mənzərə verir: qarşıda şlaqbaumlu keçid var, relslər çoxxətlidir, keçidə bu qədər qalıb.

### Niyə vacibdir

Yolda nişanlar nadir hallarda tək dayanır. Real yolayrıcında eyni anda üstünlük nişanı, qadağa nişanı və məlumat nişanı ola bilər. Hər birini ayrıca oxumaq azdır — onları bir cümlə kimi birlikdə oxumaq lazımdır: "burada üstünlük məndədir, amma durmaq qadağandır və kəsişən yolda giriş bağlıdır".

> **Diqqət:** Nişanın altındakı lövhə nişanı ləğv etmir, onu dəqiqləşdirir — kimə aid olduğunu, hansı məsafədə və ya hansı istiqamətdə qüvvədə olduğunu göstərir. Nişanı lövhəsiz oxumaq yarımçıq oxumaqdır.

## Yekun

- 5.39 kəsişən yolda qüvvədə olan xəbərdaredici və ya qadağanedici nişanları əvvəlcədən göstərir.
- 2.1 və 2.4 birlikdə yolayrıcında keçid növbəliliyini müəyyən edir.
- 2.5 stop-xətt ilə birlikdə işləyir; 7.13 lövhəsi görünəndə baş yolla gedənə yol verilir.
- 3.29 və 3.30 yolun iki tərəfində birlikdə tətbiq edildikdə 19:00—21:00 arası durmağa icazə yaranır.
- Dəmir yol keçidində 1.1, 1.3 və 1.4 qrupu birlikdə tam mənzərə verir.`,
    questions: [
      { q: '5.39 nişanı nəyi göstərir?', options: ['Kəsişən yolda qüvvədə olan xəbərdaredici və ya qadağanedici nişanları', 'Yolun nömrəsini', 'Məsafələri', 'Duracaq yerini'], correct: 0, explanation: '5.39 nişanı kəsişmə yoluna aid xəbərdaredici və ya qadağanedici nişanları göstərir.' },
      { q: '3.29 və 3.30 nişanları yolun iki tərəfində eyni vaxtda tətbiq edilərsə, nə baş verir?', options: ['Saat 19:00-dan 21:00-a kimi durmağa icazə verilir', 'Durmaq tamamilə qadağan olunur', 'Sürət həddi qalxır', 'Ötmək qadağan olunur'], correct: 0, explanation: 'Bu nişanlar yolun solunda və sağında eyni vaxtda və eyni səviyyədə tətbiq edilərsə, təsiri sahələrində saat 19:00-dan 21:00-a kimi (yerdəyişmə zamanı) durmağa icazə verilir.' },
      { q: '2.5 nişanı olan yerdə stop-xətt yoxdursa, harada dayanmaq lazımdır?', options: ['Hərəkət hissələrinin kəsişmə xətti qarşısında', 'Yolayrıcının ortasında', 'Yolayrıcını keçdikdən sonra', 'Nişandan 50 metr əvvəl'], correct: 0, explanation: 'Stop-xətt olmadıqda sürücü hərəkət hissələrinin kəsişmə xətti qarşısında dayanmalıdır.' },
      { q: 'Sürücü kəsişən yola yaxınlaşarkən 7.13 lövhəsini gördükdə nə etməlidir?', options: ['Baş yolla hərəkət edən nəqliyyat vasitəsinə yol verməlidir', 'Sürəti artırmalıdır', 'Heç nə dəyişmir', 'Geriyə dönməlidir'], correct: 0, explanation: '2.5 nişanının izahına görə sürücü 7.13 lövhəsini gördükdə baş yolla hərəkət edən nəqliyyat vasitəsinə yol verməlidir.' },
      { q: 'Nişanın altındakı lövhənin rolu nədir?', options: ['Nişanın mənasını dəqiqləşdirir', 'Nişanı ləğv edir', 'Nişanı əvəz edir', 'Heç bir rolu yoxdur'], correct: 0, explanation: 'Lövhə nişanı ləğv etmir — kimə aid olduğunu, hansı məsafədə və ya istiqamətdə qüvvədə olduğunu dəqiqləşdirir.' },
      { q: 'Duracağın qadağan olunduğu yerləri bildirən nişanlanma xətti hansı nişanla birlikdə tətbiq oluna bilər?', options: ['3.28', '3.24', '2.1', '5.15'], correct: 0, explanation: 'Həmin nişanlanma xətti müstəqil və ya 3.28 nişanı ilə birlikdə tətbiq olunur.' },
      { q: 'Dəmir yol keçidində 1.1, 1.3.2 və 1.4 qrupu birlikdə nə deyir?', options: ['Şlaqbaumlu keçid var, relslər çoxxətlidir, keçidə bu qədər qalıb', 'Keçid bağlıdır', 'Keçiddə dayanmaq qadağandır', 'Keçiddə sürət həddi var'], correct: 0, explanation: 'Üç nişan birlikdə keçidin növünü, relslərin sayını və keçidə qalan məsafəni göstərir.' },
      { q: 'Yolayrıcında 2.1 və yan yolda 2.4 nişanı var. Kim keçir?', options: ['Baş yolla hərəkət edən', 'Yan yoldan çıxan', 'Sağdakı', 'Birinci gələn'], correct: 0, explanation: '2.1 baş yolu bildirir, 2.4 isə yan yoldan çıxana yol verməyi tələb edir.' },
      { q: 'Real yolayrıcında nişanları necə oxumaq lazımdır?', options: ['Hamısını birlikdə, bir cümlə kimi', 'Yalnız ən böyüyünü', 'Yalnız qırmızı olanı', 'Yalnız sonuncunu'], correct: 0, explanation: 'Eyni yerdə bir neçə nişan ola bilər — onları birlikdə oxumaq lazımdır.' },
      { q: '5.39 nişanı sürücüyə hansı üstünlüyü verir?', options: ['Dönmədən əvvəl kəsişən yolda nə olduğunu bilir', 'Sürəti artırmağa icazə verir', 'Dayanmağa icazə verir', 'Ötməyə icazə verir'], correct: 0, explanation: '5.39 kəsişən yoldakı nişanları əvvəlcədən göstərdiyi üçün sürücü dönmədən əvvəl qərar verə bilir.' },
      { q: '3.29 nişanı tək qoyulubsa, 19:00—21:00 güzəşti tətbiq olunurmu?', options: ['Xeyr — güzəşt hər iki nişanın eyni vaxtda tətbiqindən doğur', 'Bəli, həmişə tətbiq olunur', 'Yalnız yayda', 'Yalnız şəhər mərkəzində'], correct: 0, explanation: 'Güzəşt 3.29 və 3.30 nişanlarının yolun iki tərəfində eyni vaxtda və eyni səviyyədə tətbiqi halına aiddir.' },
      { q: '2.5 nişanı dəmir yol keçidi qarşısında da qoyula bilərmi?', options: ['Bəli — bu halda stop-xəttin, o yoxdursa nişanın qarşısında dayanılır', 'Xeyr, yalnız yolayrıcında qoyulur', 'Yalnız şəhərdə qoyulur', 'Yalnız gecə qoyulur'], correct: 0, explanation: 'Bu nişan dəmir yol keçidi və ya digər postlar qarşısında da quraşdırıla bilər; sürücü stop-xəttin, o yoxdursa nişanın qarşısında dayanmalıdır.' },
      { q: 'Nişanları tək-tək oxumaq niyə kifayət etmir?', options: ['Real yolda bir neçə nişan eyni anda qüvvədə olur', 'Nişanlar tez-tez dəyişir', 'Nişanlar bir-birini ləğv edir', 'Nişanların mənası yoxdur'], correct: 0, explanation: 'Eyni yolayrıcında üstünlük, qadağa və məlumat nişanları birlikdə ola bilər — məna onların birləşməsindən çıxır.' },
      { q: 'Stop-xətt (5.33) və 2.5 nişanı birlikdə necə işləyir?', options: ['Nişan dayanmağı tələb edir, xətt harada dayanmağı göstərir', 'Xətt nişanı ləğv edir', 'İkisi bir-birindən asılı deyil', 'Nişan yalnız xətt olmayanda işləyir'], correct: 0, explanation: '2.5 dayanmağı tələb edir, stop-xətt isə maşının saxlanacağı yeri göstərir.' },
      { q: 'Nişan və onun altındakı lövhə ziddiyyət təşkil edirmi?', options: ['Xeyr — lövhə nişanı dəqiqləşdirir', 'Bəli, lövhə həmişə güclüdür', 'Bəli, nişan həmişə güclüdür', 'Lövhələr nişanlarla birlikdə qoyulmur'], correct: 0, explanation: 'Lövhə nişanın tətbiq dairəsini dəqiqləşdirir, onu ləğv etmir.' },
    ],
  },
  {
    title: 'Tam səfər: bütün nişan ailələri bir yolda',
    codes: ['5.22', '3.24', '1.20', '5.16.1', '2.4', '4.1.2', '3.27', '5.15', '5.23', '5.1', '3.20', '1.13', '2.6', '6.3', '6.11', '5.2', '3.31'],
    content: `## Səhər: şəhərin içində

Açarı çevirib küçəyə çıxırsan. Bu dərsdə yeni nişan öyrənmirsən — bütün ailələri bir səfərdə yan-yana görürsən və hər biri üçün "bu nişan mənə nə deyir" sualına cavab verirsən.

Küçənin başında yaşayış məntəqəsinin başlanğıcı nişanı var: məlumat-göstərici ailə, şəhər rejimi başlayır.

![nisan:5.22]

Dərhal arxasınca qırmızı haşiyəli dairə: maksimum sürətin məhdudlaşdırılması. Qadağanedici ailə — nişanda göstərilən həddən artıq sürətlə hərəkət etmək qadağandır.

![nisan:3.24]

Üçbucaqlı nişan qarşıda piyada keçidi olduğunu bildirir — xəbərdarlıq ailəsi, məhdudiyyət qoymur, diqqət tələb edir.

![nisan:1.20]

Bir neçə saniyə sonra kvadrat nişan keçidin özünü göstərir.

![nisan:5.16.1]

Yolayrıcında üçbucaqlı "Yol ver" nişanı — üstünlük ailəsi.

![nisan:2.4]

Yolayrıcını keçdikdən sonra mavi dairə səni sağa yönəldir: məcburi hərəkət istiqaməti.

![nisan:4.1.2]

Küçənin bu hissəsində dayanmaq qadağandır — nəqliyyat vasitələrinin dayanması və durması qadağandır.

![nisan:3.27]

Bir az irəlidə isə maşını qoymağa icazə verən nişan var: duracaq yeri.

![nisan:5.15]

## Günorta: şəhərdən çıxış və magistral

Şəhərin sonunda yaşayış məntəqəsinin qurtaracağı nişanı şəhər rejimini bağlayır.

![nisan:5.23]

Magistrala qalxırsan.

![nisan:5.1]

Dolanbac sahədə ötmək qadağandır nişanı qüvvəyə minir.

![nisan:3.20]

Enişdə sərt eniş barədə xəbərdarlıq nişanı görünür — sürəti əvvəlcədən azaltmaq lazımdır.

![nisan:1.13]

Dar körpüdə qarşıdan hərəkətin üstünlüyü nişanı dayanır: qarşıdan gələnə yol verməlisən.

![nisan:2.6]

Yanacaq azalıb — servis ailəsi kömək edir: yanacaqdoldurma məntəqəsi.

![nisan:6.3]

Yorulmusan, növbəti mavi lövhə dincəlmə yerini göstərir.

![nisan:6.11]

## Axşam: rejimlərin bağlanması

Magistral bitir.

![nisan:5.2]

Yol boyu qüvvədə olan bir neçə məhdudiyyət isə tək bir nişanla bağlanır: bütün məhdudiyyətlər zonasının qurtaracağı.

![nisan:3.31]

### Niyə vacibdir

Bir günlük səfərdə altı nişan ailəsinin hamısı ilə qarşılaşdın: xəbərdarlıq, üstünlük, qadağanedici, məcburi, məlumat-göstərici və servis. Onları bir-birindən ayırd etmək — formaya və rəngə baxıb "bu nişan mənə əmr edir, yoxsa məlumat verir?" sualına dərhal cavab vermək — sürücülüyün əsasıdır.

> **Diqqət:** Nişanın ailəsini bilmək onun gücünü də bilmək deməkdir. Xəbərdarlıq nişanı heç nə qadağan etmir, qadağanedici nişan hərəkəti məhdudlaşdırır, məcburi nişan istiqaməti əmr edir, məlumat-göstərici və servis nişanları isə şərait barədə məlumat verir.

## Yekun

- Xəbərdarlıq nişanları (1.x) məhdudiyyət qoymur, diqqət tələb edir.
- Üstünlük nişanları (2.x) keçid növbəliliyini müəyyən edir.
- Qadağanedici nişanlar (3.x) hərəkəti məhdudlaşdırır və çox vaxt qurtaracaq nişanı ilə cütlük təşkil edir.
- Məcburi nişanlar (4.x) mavi fonludur və istiqaməti əmr edir.
- Məlumat-göstərici (5.x) və servis (6.x) nişanları yolun rejimi və obyektlər barədə məlumat verir.`,
    questions: [
      { q: 'Yol nişanlarının hansı ailəsi heç bir məhdudiyyət qoymur?', options: ['Xəbərdarlıq nişanları', 'Qadağanedici nişanlar', 'Məcburi nişanlar', 'Üstünlük nişanları'], correct: 0, explanation: 'Xəbərdarlıq nişanları heç bir məhdudiyyət qoymur — yalnız qarşıdakı təhlükə barədə xəbərdar edir.' },
      { q: 'Mavi dairəvi nişan sürücüyə nə deyir?', options: ['Hansı istiqamətdə hərəkət etməli olduğunu əmr edir', 'Təhlükə barədə xəbərdar edir', 'Xidmət obyektini göstərir', 'Üstünlüyü müəyyən edir'], correct: 0, explanation: 'Məcburi nişanlar mavi dairə formasındadır və hərəkət istiqamətini əmr edir.' },
      { q: '1.20 və 5.16 nişanları arasındakı fərq nədir?', options: ['1.20 qarşıda keçid olduğunu, 5.16 keçidin özünü bildirir', '1.20 keçidin özünü bildirir', 'İkisi eynidir', '5.16 yalnız gecə qoyulur'], correct: 0, explanation: '1.20 xəbərdarlıq nişanıdır, 5.16 isə piyada keçidinin məhz orada olduğunu göstərir.' },
      { q: '2.4 nişanı hansı ailəyə aiddir?', options: ['Üstünlük nişanlarına', 'Xəbərdarlıq nişanlarına', 'Servis nişanlarına', 'Məcburi nişanlara'], correct: 0, explanation: '2.4 "Yol ver" nişanı üstünlük nişanları ailəsindəndir.' },
      { q: '3.27 nişanı nəyi qadağan edir?', options: ['Həm dayanmağı, həm durmağı', 'Yalnız durmağı', 'Ötməyi', 'Sürəti'], correct: 0, explanation: '3.27 nişanı nəqliyyat vasitələrinin dayanmasını və durmasını qadağan edir.' },
      { q: '5.15 nişanı nəyi göstərir?', options: ['Duracaq yerini', 'Dayanacaq yerini', 'Dincəlmə yerini', 'Yanacaqdoldurma məntəqəsini'], correct: 0, explanation: '5.15 nişanı duracaq yerini göstərir.' },
      { q: '6.3 nişanı hansı ailəyə aiddir və nəyi göstərir?', options: ['Servis nişanı — yanacaqdoldurma məntəqəsini', 'Qadağanedici nişan — yanacaq daşımanı', 'Xəbərdarlıq nişanı — yanğın təhlükəsini', 'Məcburi nişan — dayanmağı'], correct: 0, explanation: '6.3 servis nişanıdır və yanacaqdoldurma məntəqəsini göstərir.' },
      { q: '2.6 nişanı olan dar körpüdə kim keçir?', options: ['Qarşıdan gələn — sən yol verməlisən', 'Sən', 'Yük maşınları', 'Birinci çatan'], correct: 0, explanation: '2.6 qarşıdan hərəkətin üstünlüyünü bildirir — qarşıdan gələnə yol verilməlidir.' },
      { q: '1.13 nişanı nəyi bildirir?', options: ['Sərt enişi', 'Sərt yoxuşu', 'Sürüşkən yolu', 'Yolun daralmasını'], correct: 0, explanation: '1.13 nişanı sərt enişi bildirir.' },
      { q: '3.31 nişanı səfərin sonunda nə edir?', options: ['Eyni vaxtda qüvvədə olan bir neçə məhdudiyyəti bitirir', 'Yeni məhdudiyyət başladır', 'Yolun sonunu bildirir', 'Sürəti artırır'], correct: 0, explanation: '3.31 eyni vaxtda bir neçə nişanın qüvvədə olduğu sahənin bitməsini bildirir.' },
      { q: '5.22 nişanını gördükdən sonra nə başlayır?', options: ['Yaşayış məntəqəsi rejimi', 'Avtomagistral rejimi', 'Birtərəfli hərəkət', 'Qarşılıqlı hərəkət'], correct: 0, explanation: '5.22 yaşayış məntəqəsinin başlanğıcını bildirir.' },
      { q: 'Servis nişanları hansı məlumatı verir?', options: ['Yollarda obyektlərin yerləşməsi barədə', 'Üstünlük qaydası barədə', 'Sürət həddi barədə', 'Dönmə qadağaları barədə'], correct: 0, explanation: 'Servis nişanları yollarda müvafiq obyektlərin yerləşməsi barədə məlumat verir.' },
      { q: 'Nişanın formasına və rənginə baxıb nəyi anlamaq olar?', options: ['Nişanın hansı ailəyə aid olduğunu və nə qədər güclü olduğunu', 'Nişanın neçə il əvvəl qoyulduğunu', 'Yolun uzunluğunu', 'Yolun nömrəsini'], correct: 0, explanation: 'Nişanın forması və rəngi onun ailəsini — xəbərdarlıq, qadağa, əmr və ya məlumat olduğunu göstərir.' },
      { q: '3.24 nişanı nəyi qadağan edir?', options: ['Nişanda göstərilən həddən artıq sürətlə hərəkəti', 'Ötməyi', 'Dayanmağı', 'Dönməyi'], correct: 0, explanation: '3.24 nişanda göstərilmiş həddən (km/saat) artıq sürətlə hərəkət etməyi qadağan edir.' },
      { q: '4.1.2 nişanı yolayrıcında nə tələb edir?', options: ['Sağa hərəkət etməyi', 'Sola hərəkət etməyi', 'Düzünə hərəkət etməyi', 'Dayanmağı'], correct: 0, explanation: '4.1.2 nişanı sağa hərəkəti göstərir.' },
    ],
  },
];
