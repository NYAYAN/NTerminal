import type { ThemeRegistration } from "@shikijs/primitive";

/**
 * Gramerin kapsam adlarından (`keyword.control.ts`, `string.quoted.double`)
 * RENK SINIFINA: dosya görüntüleyicisinin boyadığı ~30 tür.
 *
 * ## Neden bir tema değil, bir sınıflandırıcı
 *
 * Shiki normalde bir VS Code temasıyla renk üretiyor. Burada renk TEMADAN
 * gelmiyor, uygulamanın kendi temasından (`themes.ts` › `syntax`): koyu
 * temada ve açık temada aynı belirteçler, farklı renkler. Bu yüzden tema
 * yalnızca türü kodluyor — her türün "rengi" `#0000NN`, NN türün sırası.
 * Renk CSS'te `--syn-<tür>` değişkeninden (`.syn-<tür>` sınıfı); tema
 * değişince yeniden renklendirmek gerekmiyor.
 *
 * ## Kurallar
 *
 * VS Code'un varsayılan koyu temasının (Dark+) kurallarından. TextMate
 * eşleşmesi en ÖZGÜL kuralı seçiyor: `keyword.operator` işleçleri düz
 * bırakıyor, `keyword.operator.new` (`new`, `typeof`, `instanceof`) yine
 * anahtar sözcük. `meta.embedded` / `meta.template.expression` düz: dize
 * içindeki `${…}` ifadesi dize renginde boyanmasın, kendi belirteçleriyle.
 */

/** Sınıfların sırası; 0 düz metin (sınıfsız). Sıra `#0000NN` kodlamasının kendisi. */
export const SYNTAX_CLASSES = [
  "",
  "comment",
  "keyword",
  "control",
  "string",
  "number",
  "constant",
  "function",
  "type",
  "variable",
  "property",
  "param",
  "tag",
  "attr",
  "regexp",
  "escape",
  "decorator",
  "operator",
  "punct",
  "heading",
  "link",
  "code",
  "quote",
  "strong",
  "emphasis",
  "inserted",
  "deleted",
  "changed",
  "invalid",
] as const;

export type SyntaxClass = Exclude<(typeof SYNTAX_CLASSES)[number], "">;

const RULES: [SyntaxClass | "", string[]][] = [
  ["comment", ["comment", "punctuation.definition.comment", "string.comment"]],
  [
    "keyword",
    [
      "keyword",
      "storage",
      "storage.type",
      "storage.modifier",
      "keyword.operator.new",
      "keyword.operator.expression",
      "keyword.operator.cast",
      "keyword.operator.sizeof",
      "keyword.operator.alignof",
      "keyword.operator.typeid",
      "keyword.operator.alignas",
      "keyword.operator.instanceof",
      "keyword.operator.logical.python",
      "keyword.operator.wordlike",
      "keyword.operator.noexcept",
      "variable.language",
      "constant.character",
      "constant.other.option",
      "meta.preprocessor",
      "entity.name.function.preprocessor",
      "punctuation.definition.template-expression.begin",
      "punctuation.definition.template-expression.end",
      "punctuation.section.embedded",
      "punctuation.definition.list.begin.markdown",
      "meta.diff.header",
    ],
  ],
  [
    "control",
    [
      "keyword.control",
      "source.cpp keyword.operator.new",
      "keyword.operator.delete",
      "keyword.other.using",
      "keyword.other.directive.using",
      "keyword.other.operator",
      "entity.name.operator",
    ],
  ],
  ["operator", ["keyword.operator"]],
  [
    "string",
    [
      "string",
      "meta.embedded.assembly",
      "string.tag",
      "string.value",
      "meta.preprocessor.string",
      "support.constant.property-value",
      "support.constant.font-name",
      "support.constant.media-type",
      "support.constant.media",
      "constant.other.color.rgb-value",
      "constant.other.rgb-value",
      "support.constant.color",
    ],
  ],
  [
    "regexp",
    [
      "string.regexp",
      "constant.regexp",
      "punctuation.definition.group.regexp",
      "punctuation.definition.group.assertion.regexp",
      "punctuation.definition.character-class.regexp",
      "punctuation.character.set.begin.regexp",
      "punctuation.character.set.end.regexp",
      "keyword.operator.negation.regexp",
      "keyword.operator.quantifier.regexp",
      "keyword.operator.or.regexp",
      "keyword.control.anchor.regexp",
      "support.other.parenthesis.regexp",
      "constant.character.character-class.regexp",
      "constant.other.character-class.set.regexp",
      "constant.other.character-class.regexp",
      "constant.character.set.regexp",
    ],
  ],
  ["escape", ["constant.character.escape", "constant.character.entity"]],
  [
    "number",
    [
      "constant.numeric",
      "keyword.operator.plus.exponent",
      "keyword.operator.minus.exponent",
      "keyword.other.unit",
      "meta.preprocessor.numeric",
      "constant.sha.git-rebase",
    ],
  ],
  [
    "constant",
    ["constant.language", "constant.other", "support.constant", "variable.other.constant", "variable.other.enummember"],
  ],
  [
    "function",
    [
      "entity.name.function",
      "support.function",
      "variable.function",
      "support.constant.handlebars",
      "source.powershell variable.other.member",
      "entity.name.operator.custom-literal",
    ],
  ],
  [
    "type",
    [
      "support.class",
      "support.type",
      "entity.name.type",
      "entity.name.namespace",
      "entity.other.attribute",
      "entity.name.scope-resolution",
      "entity.name.class",
      "entity.name.section.group-title",
      "storage.type.numeric.go",
      "storage.type.byte.go",
      "storage.type.boolean.go",
      "storage.type.string.go",
      "storage.type.uintptr.go",
      "storage.type.error.go",
      "storage.type.rune.go",
      "storage.type.cs",
      "storage.type.generic.cs",
      "storage.type.modifier.cs",
      "storage.type.variable.cs",
      "storage.type.generic.java",
      "storage.type.java",
      "storage.type.object.array.java",
      "storage.type.primitive.array.java",
      "storage.type.primitive.java",
      "storage.type.token.java",
      "storage.type.groovy",
      "storage.type.parameters.groovy",
      "storage.type.generic.groovy",
      "storage.type.object.array.groovy",
      "storage.type.primitive.array.groovy",
      "storage.type.primitive.groovy",
      "meta.type.cast.expr",
      "meta.type.new.expr",
      "support.constant.math",
      "support.constant.dom",
      "support.constant.json",
      "entity.other.inherited-class",
      "punctuation.separator.namespace.ruby",
    ],
  ],
  [
    "variable",
    ["variable", "meta.definition.variable.name", "support.variable", "entity.name.variable", "constant.other.placeholder"],
  ],
  [
    "property",
    [
      "variable.other.property",
      "variable.other.object.property",
      "meta.object-literal.key",
      "support.type.property-name",
      "support.type.vendored.property-name",
      "meta.structure.dictionary.key.python",
      "entity.name.tag.yaml",
      "support.variable.property",
    ],
  ],
  ["param", ["variable.parameter", "entity.name.variable.parameter"]],
  ["tag", ["entity.name.tag", "entity.name.tag.css", "entity.name.tag.less"]],
  ["attr", ["entity.other.attribute-name"]],
  ["punct", ["punctuation.definition.tag"]],
  [
    "decorator",
    [
      "meta.decorator",
      "punctuation.decorator",
      "meta.decorator entity.name.function",
      "entity.name.function.decorator",
      "storage.type.annotation",
      "punctuation.definition.annotation",
    ],
  ],
  [
    "heading",
    ["markup.heading", "entity.name.section.markdown", "punctuation.definition.heading.markdown", "meta.diff.range"],
  ],
  ["link", ["markup.underline.link", "string.other.link"]],
  ["code", ["markup.inline.raw", "markup.raw", "markup.fenced_code.block.markdown"]],
  ["quote", ["markup.quote", "punctuation.definition.quote.begin.markdown"]],
  ["strong", ["markup.bold"]],
  ["emphasis", ["markup.italic"]],
  ["inserted", ["markup.inserted", "meta.diff.header.to-file", "punctuation.definition.to-file.diff"]],
  ["deleted", ["markup.deleted", "meta.diff.header.from-file", "punctuation.definition.from-file.diff"]],
  ["changed", ["markup.changed"]],
  ["invalid", ["invalid"]],
  // Dark+'ta da düz: gömülü kod kendi belirteçleriyle boyanıyor.
  [
    "",
    [
      "meta.embedded",
      "source.groovy.embedded",
      "meta.template.expression",
      "string meta.image.inline.markdown",
      "variable.legacy.builtin.python",
      "storage.modifier.import.java",
      "storage.modifier.package.java",
      "variable.language.wildcard.java",
    ],
  ],
];

/** Sınıfın tema içindeki kodu: `#0000NN`. */
function code(cls: SyntaxClass | ""): string {
  return `#${SYNTAX_CLASSES.indexOf(cls).toString(16).padStart(6, "0")}`;
}

/** Shiki'ye verilen "tema": renk değil sınıf kodluyor (yukarıda). */
export const CLASSIFIER_THEME: ThemeRegistration = {
  name: "nterminal-classes",
  type: "dark",
  fg: code(""),
  bg: "#ffffff",
  settings: [
    { settings: { foreground: code(""), background: "#ffffff" } },
    ...RULES.map(([cls, scope]) => ({ scope, settings: { foreground: code(cls) } })),
  ],
};

/**
 * Renklendiricinin renk tablosundan (`colorMap`, kimlik → `#RRGGBB`) sınıf
 * sırasına. Tablonun 0. girdisi boş; bilinmeyen kod düz metin.
 */
export function classTable(colorMap: readonly (string | undefined)[]): Uint8Array {
  const table = new Uint8Array(colorMap.length);
  colorMap.forEach((color, id) => {
    const n = color ? Number.parseInt(color.slice(1), 16) : 0;
    table[id] = Number.isInteger(n) && n > 0 && n < SYNTAX_CLASSES.length ? n : 0;
  });
  return table;
}
