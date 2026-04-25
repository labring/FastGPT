/**
 * Agentic Search 多语言标签
 *
 * eld 支持的语言均在此处有对应条目。翻译采用机器翻译 + 人工校验方式维护，
 * 缺失的语言会 fallback 到中性格式（不显示任何固定语言文本）。
 *
 * 新增语言：在此 Map 中追加一行即可，formatAgenticLabel 自动生效。
 */

// ============================================================
// 标签定义（每个事件一条模板，{{key}} 为运行时替换变量）
// ============================================================

type LabelSet = {
  searching: string;
  searchingFallback: string;
  searchDone: string;
  rewriting: string;
  reflecting: string;
  finalNotFound: string;
};

// 中性 fallback：不注入任何语言特有的固定文字
const NEUTRAL: LabelSet = {
  searching: '\n{{queries}}\n',
  searchingFallback: '\n...\n',
  searchDone: '{{count}}\n',
  rewriting: '',
  reflecting: '',
  finalNotFound: ''
};

const LABELS: Record<string, Partial<LabelSet>> = {
  zh: {
    searching: '\n检索「{{queries}}」\n',
    searchingFallback: '\n检索中...\n',
    searchDone: '检索到 {{count}} 条结果\n',
    rewriting: '\n现有信息不足以完整回答，扩展检索范围...\n',
    reflecting: '\n评估已收集信息的完整性...\n',
    finalNotFound: '知识库中未找到与此问题相关的内容。\n'
  },
  en: {
    searching: '\nSearching: "{{queries}}"\n',
    searchingFallback: '\nSearching...\n',
    searchDone: 'Retrieved {{count}} result(s)\n',
    rewriting:
      '\nInsufficient information to fully answer the question, broadening search scope...\n',
    reflecting: '\nEvaluating completeness of gathered information...\n',
    finalNotFound: 'No relevant information found in the knowledge base.\n'
  },
  ja: {
    searching: '\n「{{queries}}」を検索中\n',
    searchingFallback: '\n検索中...\n',
    searchDone: '{{count}}件の結果を取得\n',
    rewriting: '\n情報が不十分なため、検索範囲を拡大しています...\n',
    reflecting: '\n収集した情報の完全性を評価中...\n',
    finalNotFound: 'ナレッジベースに関連コンテンツが見つかりませんでした。\n'
  },
  ko: {
    searching: '\n검색 중: "{{queries}}"\n',
    searchingFallback: '\n검색 중...\n',
    searchDone: '{{count}}개 결과 검색됨\n',
    rewriting: '\n기존 정보로는 완전한 답변이 어려워 검색 범위를 확장합니다...\n',
    reflecting: '\n수집된 정보의 완전성을 평가 중...\n',
    finalNotFound: '지식 베이스에서 관련 정보를 찾을 수 없습니다.\n'
  },
  th: {
    searching: '\nกำลังค้นหา: "{{queries}}"\n',
    searchingFallback: '\nกำลังค้นหา...\n',
    searchDone: 'พบ {{count}} รายการ\n',
    rewriting: '\nข้อมูลที่มีไม่เพียงพอที่จะตอบคำถามอย่างสมบูรณ์ กำลังขยายขอบเขตการค้นหา...\n',
    reflecting: '\nกำลังประเมินความสมบูรณ์ของข้อมูลที่รวบรวม...\n',
    finalNotFound: 'ไม่พบข้อมูลที่เกี่ยวข้องในฐานความรู้\n'
  },
  fr: {
    searching: '\nRecherche : "{{queries}}"\n',
    searchingFallback: '\nRecherche...\n',
    searchDone: '{{count}} résultat(s) trouvé(s)\n',
    rewriting:
      '\nInformations insuffisantes pour répondre complètement, élargissement de la recherche...\n',
    reflecting: "\nÉvaluation de l'exhaustivité des informations collectées...\n",
    finalNotFound: 'Aucune information pertinente trouvée dans la base de connaissances.\n'
  },
  de: {
    searching: '\nSuche: "{{queries}}"\n',
    searchingFallback: '\nSuche...\n',
    searchDone: '{{count}} Ergebnis(se) gefunden\n',
    rewriting:
      '\nUnzureichende Informationen für eine vollständige Antwort, Suche wird erweitert...\n',
    reflecting: '\nBewertung der Vollständigkeit der gesammelten Informationen...\n',
    finalNotFound: 'Keine relevanten Informationen in der Wissensdatenbank gefunden.\n'
  },
  es: {
    searching: '\nBuscando: "{{queries}}"\n',
    searchingFallback: '\nBuscando...\n',
    searchDone: '{{count}} resultado(s) encontrado(s)\n',
    rewriting: '\nInformación insuficiente para responder completamente, ampliando búsqueda...\n',
    reflecting: '\nEvaluando la integridad de la información recopilada...\n',
    finalNotFound: 'No se encontró información relevante en la base de conocimiento.\n'
  },
  pt: {
    searching: '\nPesquisando: "{{queries}}"\n',
    searchingFallback: '\nPesquisando...\n',
    searchDone: '{{count}} resultado(s) encontrado(s)\n',
    rewriting:
      '\nInformações insuficientes para responder completamente, ampliando a pesquisa...\n',
    reflecting: '\nAvaliando a completude das informações coletadas...\n',
    finalNotFound: 'Nenhuma informação relevante encontrada na base de conhecimento.\n'
  },
  ru: {
    searching: '\nПоиск: "{{queries}}"\n',
    searchingFallback: '\nПоиск...\n',
    searchDone: 'Найдено: {{count}} результатов\n',
    rewriting: '\nНедостаточно информации для полного ответа, расширяем область поиска...\n',
    reflecting: '\nОценка полноты собранной информации...\n',
    finalNotFound: 'В базе знаний не найдено релевантной информации.\n'
  },
  ar: {
    searching: '\nالبحث: "{{queries}}"\n',
    searchingFallback: '\nجار البحث...\n',
    searchDone: 'تم العثور على {{count}} نتيجة\n',
    rewriting: '\nالمعلومات غير كافية للإجابة الكاملة، توسيع نطاق البحث...\n',
    reflecting: '\nتقييم اكتمال المعلومات التي تم جمعها...\n',
    finalNotFound: 'لم يتم العثور على معلومات ذات صلة في قاعدة المعرفة.\n'
  },
  vi: {
    searching: '\nĐang tìm kiếm: "{{queries}}"\n',
    searchingFallback: '\nĐang tìm kiếm...\n',
    searchDone: 'Đã tìm thấy {{count}} kết quả\n',
    rewriting: '\nThông tin không đủ để trả lời đầy đủ, đang mở rộng phạm vi tìm kiếm...\n',
    reflecting: '\nĐang đánh giá tính đầy đủ của thông tin đã thu thập...\n',
    finalNotFound: 'Không tìm thấy thông tin liên quan trong cơ sở tri thức.\n'
  },
  id: {
    searching: '\nMencari: "{{queries}}"\n',
    searchingFallback: '\nMencari...\n',
    searchDone: 'Ditemukan {{count}} hasil\n',
    rewriting: '\nInformasi tidak cukup untuk menjawab lengkap, memperluas pencarian...\n',
    reflecting: '\nMengevaluasi kelengkapan informasi yang dikumpulkan...\n',
    finalNotFound: 'Tidak ditemukan informasi relevan di basis pengetahuan.\n'
  },
  tr: {
    searching: '\nAranıyor: "{{queries}}"\n',
    searchingFallback: '\nAranıyor...\n',
    searchDone: '{{count}} sonuç bulundu\n',
    rewriting: '\nTam yanıt için bilgi yetersiz, arama kapsamı genişletiliyor...\n',
    reflecting: '\nToplanan bilgilerin eksiksizliği değerlendiriliyor...\n',
    finalNotFound: 'Bilgi tabanında ilgili bilgi bulunamadı.\n'
  },
  it: {
    searching: '\nRicerca: "{{queries}}"\n',
    searchingFallback: '\nRicerca...\n',
    searchDone: '{{count}} risultato(i) trovato(i)\n',
    rewriting:
      '\nInformazioni insufficienti per rispondere completamente, ampliamento della ricerca...\n',
    reflecting: '\nValutazione della completezza delle informazioni raccolte...\n',
    finalNotFound: 'Nessuna informazione pertinente trovata nella knowledge base.\n'
  },
  pl: {
    searching: '\nSzukanie: "{{queries}}"\n',
    searchingFallback: '\nSzukanie...\n',
    searchDone: 'Znaleziono {{count}} wyników\n',
    rewriting:
      '\nNiewystarczające informacje, aby w pełni odpowiedzieć, rozszerzanie wyszukiwania...\n',
    reflecting: '\nOcena kompletności zebranych informacji...\n',
    finalNotFound: 'Nie znaleziono istotnych informacji w bazie wiedzy.\n'
  }
};

/**
 * 查找指定语言的 label。
 * 优先级：精确匹配 → 中性 fallback
 */
function getLabel(key: keyof LabelSet, lang: string): string {
  const set = LABELS[lang];
  if (set?.[key]) return set[key]!;
  // 中性 fallback：不注入任何固定语言文本
  return NEUTRAL[key];
}

/**
 * 格式化单个 agentic search 事件为对应用户语言的文本。
 * 调用方传入 lang（eld 检测结果，如 'th', 'ko'）。
 */
export function formatAgenticLabel(
  eventType: string,
  lang: string,
  params: Record<string, string | string[]>
): string {
  const template = (() => {
    switch (eventType) {
      case 'searching':
        return getLabel('searching', lang);
      case 'search_done':
        return getLabel('searchDone', lang);
      case 'rewriting':
        return getLabel('rewriting', lang);
      case 'reflecting':
        return getLabel('reflecting', lang);
      case 'final':
        return getLabel('finalNotFound', lang);
      // 以下事件不需要翻译，纯数据透传
      case 'generating':
        return '';
      case 'rewrite_done':
        return '{{queries_lines}}\n';
      case 'playbook_selected':
        return '{{analysis}}';
      case 'reflect_done':
        return '{{detail}}';
      default:
        return '';
    }
  })();

  if (!template) return '';

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    switch (key) {
      case 'queries': {
        const queries = (params.queries as string[]) ?? [];
        return queries.join('" , "');
      }
      case 'queries_lines': {
        const queries = (params.queries as string[]) ?? [];
        return queries.map((q) => `  · ${q}`).join('\n');
      }
      case 'count':
        return String(params.count ?? '');
      case 'detail':
        return String(params.detail ?? '');
      case 'analysis':
        return String(params.analysis ?? '');
      default:
        return '';
    }
  });
}

/**
 * searching 事件 queries 为空时的 fallback 文本
 */
export function getSearchingFallback(lang: string): string {
  return getLabel('searchingFallback', lang);
}
