// Text that only the website shows. It lives here rather than in
// src/locales/*.json because those files are bundled into the Android app,
// and the phone build must not change. Registered into the same i18next
// instance at startup by src/app/_layout.web.tsx, so screens use the normal
// t('web.…') calls and fall back to English like every other key.
import i18next from 'i18next';

const WEB_STRINGS: Record<string, Record<string, string>> = {
  en: { quickAccess: 'Quick access', exploreTitle: 'Explore trips', exploreSub: 'Search group trips by place, budget and travel style.', chatEmptyTitle: 'Your messages', chatEmptySub: 'Choose a conversation on the left to open it here.' },
  hi: { quickAccess: 'त्वरित पहुँच', exploreTitle: 'यात्राएँ खोजें', exploreSub: 'जगह, बजट और यात्रा शैली के अनुसार ग्रुप ट्रिप खोजें।', chatEmptyTitle: 'आपके संदेश', chatEmptySub: 'इसे यहाँ खोलने के लिए बाईं ओर से कोई बातचीत चुनें।' },
  bn: { quickAccess: 'দ্রুত অ্যাক্সেস', exploreTitle: 'ভ্রমণ খুঁজুন', exploreSub: 'জায়গা, বাজেট ও ভ্রমণের ধরন অনুযায়ী গ্রুপ ট্রিপ খুঁজুন।', chatEmptyTitle: 'আপনার বার্তা', chatEmptySub: 'এখানে খুলতে বাঁ দিক থেকে একটি কথোপকথন বেছে নিন।' },
  te: { quickAccess: 'త్వరిత ప్రాప్యత', exploreTitle: 'యాత్రలను అన్వేషించండి', exploreSub: 'ప్రదేశం, బడ్జెట్ మరియు ప్రయాణ శైలి ఆధారంగా గ్రూప్ ట్రిప్‌లను వెతకండి.', chatEmptyTitle: 'మీ సందేశాలు', chatEmptySub: 'ఇక్కడ తెరవడానికి ఎడమవైపు నుండి ఒక సంభాషణను ఎంచుకోండి.' },
  mr: { quickAccess: 'जलद प्रवेश', exploreTitle: 'सहली शोधा', exploreSub: 'ठिकाण, बजेट आणि प्रवासाच्या शैलीनुसार ग्रुप ट्रिप शोधा.', chatEmptyTitle: 'तुमचे संदेश', chatEmptySub: 'येथे उघडण्यासाठी डावीकडील एखादे संभाषण निवडा.' },
  ta: { quickAccess: 'விரைவு அணுகல்', exploreTitle: 'பயணங்களை ஆராயுங்கள்', exploreSub: 'இடம், பட்ஜெட் மற்றும் பயண பாணி மூலம் குழு பயணங்களைத் தேடுங்கள்.', chatEmptyTitle: 'உங்கள் செய்திகள்', chatEmptySub: 'இங்கே திறக்க இடப்புறத்தில் உள்ள ஒரு உரையாடலைத் தேர்ந்தெடுக்கவும்.' },
  ur: { quickAccess: 'فوری رسائی', exploreTitle: 'سفر دریافت کریں', exploreSub: 'جگہ، بجٹ اور سفر کے انداز کے مطابق گروپ ٹرپس تلاش کریں۔', chatEmptyTitle: 'آپ کے پیغامات', chatEmptySub: 'اسے یہاں کھولنے کے لیے بائیں جانب سے کوئی گفتگو منتخب کریں۔' },
  gu: { quickAccess: 'ઝડપી ઍક્સેસ', exploreTitle: 'પ્રવાસો શોધો', exploreSub: 'સ્થળ, બજેટ અને પ્રવાસ શૈલી મુજબ ગ્રુપ ટ્રિપ શોધો.', chatEmptyTitle: 'તમારા સંદેશા', chatEmptySub: 'અહીં ખોલવા માટે ડાબી બાજુથી કોઈ વાતચીત પસંદ કરો.' },
  kn: { quickAccess: 'ತ್ವರಿತ ಪ್ರವೇಶ', exploreTitle: 'ಪ್ರವಾಸಗಳನ್ನು ಅನ್ವೇಷಿಸಿ', exploreSub: 'ಸ್ಥಳ, ಬಜೆಟ್ ಮತ್ತು ಪ್ರಯಾಣ ಶೈಲಿಯ ಮೂಲಕ ಗುಂಪು ಪ್ರವಾಸಗಳನ್ನು ಹುಡುಕಿ.', chatEmptyTitle: 'ನಿಮ್ಮ ಸಂದೇಶಗಳು', chatEmptySub: 'ಇಲ್ಲಿ ತೆರೆಯಲು ಎಡಭಾಗದಿಂದ ಒಂದು ಸಂಭಾಷಣೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ.' },
  or: { quickAccess: 'ଦ୍ରୁତ ପ୍ରବେଶ', exploreTitle: 'ଯାତ୍ରା ଖୋଜନ୍ତୁ', exploreSub: 'ସ୍ଥାନ, ବଜେଟ୍ ଓ ଯାତ୍ରା ଶୈଳୀ ଅନୁସାରେ ଗ୍ରୁପ୍ ଟ୍ରିପ୍ ଖୋଜନ୍ତୁ।', chatEmptyTitle: 'ଆପଣଙ୍କ ବାର୍ତ୍ତା', chatEmptySub: 'ଏଠାରେ ଖୋଲିବା ପାଇଁ ବାମ ପଟରୁ ଏକ କଥୋପକଥନ ବାଛନ୍ତୁ।' },
  ml: { quickAccess: 'പെട്ടെന്നുള്ള ആക്സസ്', exploreTitle: 'യാത്രകൾ കണ്ടെത്തൂ', exploreSub: 'സ്ഥലം, ബജറ്റ്, യാത്രാ ശൈലി എന്നിവ അനുസരിച്ച് ഗ്രൂപ്പ് യാത്രകൾ തിരയൂ.', chatEmptyTitle: 'നിങ്ങളുടെ സന്ദേശങ്ങൾ', chatEmptySub: 'ഇവിടെ തുറക്കാൻ ഇടതുവശത്തുനിന്ന് ഒരു സംഭാഷണം തിരഞ്ഞെടുക്കൂ.' },
  pa: { quickAccess: 'ਤੁਰੰਤ ਪਹੁੰਚ', exploreTitle: 'ਯਾਤਰਾਵਾਂ ਖੋਜੋ', exploreSub: 'ਥਾਂ, ਬਜਟ ਅਤੇ ਯਾਤਰਾ ਸ਼ੈਲੀ ਅਨੁਸਾਰ ਗਰੁੱਪ ਟ੍ਰਿਪ ਲੱਭੋ।', chatEmptyTitle: 'ਤੁਹਾਡੇ ਸੁਨੇਹੇ', chatEmptySub: 'ਇਸਨੂੰ ਇੱਥੇ ਖੋਲ੍ਹਣ ਲਈ ਖੱਬੇ ਪਾਸਿਓਂ ਕੋਈ ਗੱਲਬਾਤ ਚੁਣੋ।' },
  as: { quickAccess: 'দ্ৰুত প্ৰৱেশ', exploreTitle: 'ভ্ৰমণ বিচাৰক', exploreSub: 'ঠাই, বাজেট আৰু ভ্ৰমণৰ ধৰণ অনুসৰি গ্ৰুপ ট্ৰিপ বিচাৰক।', chatEmptyTitle: 'আপোনাৰ বাৰ্তা', chatEmptySub: 'ইয়াত খুলিবলৈ বাওঁফালৰ পৰা এটা কথোপকথন বাছনি কৰক।' },
  mai: { quickAccess: 'त्वरित पहुँच', exploreTitle: 'यात्रा खोजू', exploreSub: 'जगह, बजट आ यात्राक शैलीक अनुसार ग्रुप ट्रिप खोजू।', chatEmptyTitle: 'अहाँक संदेश', chatEmptySub: 'एतय खोलबाक लेल बामा दिससँ कोनो गपशप चुनू।' },
};

export function registerWebStrings(): void {
  for (const [lng, strings] of Object.entries(WEB_STRINGS)) {
    i18next.addResourceBundle(lng, 'translation', { web: strings }, true, false);
  }
}
