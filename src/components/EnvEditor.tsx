import { useEffect, useState } from "react";

interface Props {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

/**
 * Ortam değişkeni düzenleyici.
 *
 * Nesne yerine sıralı çift dizisi üzerinde çalışıyor: kullanıcı bir anahtarın
 * adını yazarken (henüz yarım) nesne anahtarı olarak kullanmak satırların
 * yerini değiştirir ve odak kaybolur.
 */
export function EnvEditor({ value, onChange }: Props) {
  const [pairs, setPairs] = useState<[string, string][]>(() => Object.entries(value));

  // Dışarıdan farklı bir kayıt seçilirse (profil/grup değişimi) tazele.
  useEffect(() => {
    setPairs(Object.entries(value));
    // value referansı her render'da değişebilir; içerik karşılaştırması yeterli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)]);

  const commit = (next: [string, string][]) => {
    setPairs(next);
    const object: Record<string, string> = {};
    for (const [key, val] of next) {
      const name = key.trim();
      if (name) object[name] = val;
    }
    onChange(object);
  };

  return (
    <div className="env-editor">
      {pairs.map(([key, val], index) => (
        <div className="pair" key={index}>
          <input
            className="mono"
            placeholder="AD"
            value={key}
            onChange={(e) => {
              const next = [...pairs];
              next[index] = [e.target.value, val];
              commit(next);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <input
            className="mono"
            placeholder="değer"
            value={val}
            onChange={(e) => {
              const next = [...pairs];
              next[index] = [key, e.target.value];
              commit(next);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            className="icon-btn danger"
            title="Sil"
            onClick={() => commit(pairs.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button className="outline" onClick={() => setPairs([...pairs, ["", ""]])}>
        + Değişken ekle
      </button>
    </div>
  );
}
