// Spanish word problems for Runway Rally: the "Ver en español" help a teacher can turn on per class.
//
// Each generator here mirrors the English one in skills.js line for line: the same random draws in the
// same order, the same numbers, the same answers. Only the words a student reads are in Spanish.
// makeTask() in skills.js replays the English problem's random draws into these, so both languages
// show the same problem. api/test/spanish.test.js fails if the two ever drift apart, so when you change
// a generator's math in skills.js, make the same change here.
//
// Machine-drafted (Nov 2026). Needs a bilingual math teacher's review before students rely on it.
import { mulberry32, int, pick, gcd, lcm, money, neg, say, intAns, decAns, fracAns, sup, commas, TRIPLES } from './gen-helpers.js';

export const STORIES_ES = {
  mult_facts: 'Un cliente pidió juegos iguales, y cada juego lleva las mismas piezas.',
  div_facts: 'Llegó un pedido grande de materiales y hay que repartirlo en partes iguales.',
  frac_equiv: 'Dos libros de patrones escriben la misma cantidad de maneras distintas.',
  frac_simplify: 'La tabla de cortes está desordenada. Escribe los números lo más simple posible.',
  decimals: 'La caja registradora de la boutique necesita a alguien con cuidado.',
  frac_part: 'Un cliente necesita cortes exactos para que cada pieza quede bien.',
  frac_add: 'Un cliente quiere una mezcla de colores en una colección nueva.',
  frac_add_unlike: 'Dos telas se midieron con reglas distintas. Júntalas.',
  frac_mult: 'Solo se necesita una parte de la tela que sobró. ¿Cuánto es?',
  ratio: 'Un cliente quiere un patrón repetido con el equilibrio perfecto.',
  unit_rate: 'Dos proveedores, dos precios. Calcula cuánto cuesta uno.',
  fdp_convert: 'Los letreros de oferta, las etiquetas y los pedidos escriben los números de formas distintas.',
  percent_of: 'El estudio lleva la cuenta de qué parte de cada pedido está terminada.',
  percent: 'La boutique está planeando su oferta de temporada.',
  int_add: 'El desfile al aire libre es en las montañas, donde hace frío muy rápido.',
  int_mult: 'El presupuesto del estudio sube y baja. Lleva la cuenta de los cambios.',
  expr_eval: 'Cada estudio tiene una fórmula de precios. Pon los números.',
  eq_one_step: 'A un recibo se le perdió un número. Trabaja al revés para encontrarlo.',
  eq_two_step: 'A una factura se le perdió un número. Deshaz los pasos para encontrarlo.',
  frac_div: 'Hay poco material. ¿Cuántas piezas puedes cortar?',
  dec_mult_div: 'La caja de la boutique maneja precios, cuentas divididas y tela por yarda.',
  inequalities: 'Presupuestos y metas: encuentra el límite que no debes pasar, o que debes superar.',
  expr_equiv: 'Las fórmulas de los pedidos están desordenadas. Ordénalas sin cambiar lo que significan.',
  proportion: 'Los planos y bocetos están a escala. Encuentra las medidas reales.',
  area_volume: 'Cada pieza necesita la cantidad justa de tela, y cada caja el tamaño justo.',
  circles: 'Los diseños redondos necesitan medidas cuidadosas.',
  coord_plane: 'El estudio está organizado en una cuadrícula. Encuentra las distancias.',
  probability: 'Las bolsas sorpresa son lo más popular de la temporada. ¿Qué probabilidad hay?',
  exponents: 'Los patrones que se duplican y triplican crecen rápido. Las potencias mantienen la cuenta en orden.',
  sq_roots: 'Parches cuadrados y cajas en forma de cubo: a partir del tamaño, encuentra el lado.',
  sci_notation: 'La marca se hizo viral. Los números son enormes, así que escríbelos de la forma corta.',
  eq_multi_step: 'Dos planes de precios, una respuesta. Encuentra dónde son iguales.',
  slope: 'Cada línea recta de los planos tiene una inclinación. Mídela.',
  linear_models: 'Los precios y las ventas siguen patrones en línea recta. Léelos y predice.',
  systems: 'Dos pistas, dos incógnitas. Encuentra la única respuesta que cumple las dos.',
  pythagorean: 'Rampas, vigas y cortes en diagonal: encuentra el lado inclinado.',
  volume_curved: 'Latas redondas, conos y esferas necesitan la cantidad justa de espacio.',
};

// General feedback that is not tied to one problem, keyed by the English text in skills.js.
export const NOTES_ES = {
  'Type a number like 12, -3, 4.5 or 3/4.': 'Escribe un número como 12, -3, 4.5 o 3/4.',
  "That's the right amount. Write it as a fraction with the / key.": 'Es la cantidad correcta. Escríbela como fracción con la tecla /.',
  'That is equal, but it can be simplified more. Divide the top and bottom by the same number again.':
    'Es igual, pero se puede simplificar más. Divide otra vez el número de arriba y el de abajo entre el mismo número.',
  'So close. Check the sign: should it be positive or negative?': '¡Casi! Revisa el signo: ¿debe ser positivo o negativo?',
  'The digits are right. Check where the decimal point goes.': 'Los dígitos están bien. Revisa dónde va el punto decimal.',
};

// ---------- foundations ----------
function multFacts(level, theme, rng) {
  const [a, b] = level === 1 ? [int(rng, 2, 5), int(rng, 2, 9)] : level === 2 ? [int(rng, 3, 9), int(rng, 6, 9)] : [int(rng, 12, 25), int(rng, 3, 9)];
  const p = a * b;
  const tens = Math.floor(a / 10) * 10;
  return {
    prompt: say(theme, {
      jewelry: `Cada pulsera tiene ${b} dijes. ¿Cuántos dijes necesitas para ${a} pulseras?`,
      fabric: `Cada chaqueta necesita ${b} botones. ¿Cuántos botones necesitas para ${a} chaquetas?`,
      runway: `Hay ${a} modelos y cada modelo usa ${b} pasadores para el cabello. ¿Cuántos pasadores hay en total?`,
    }),
    ...intAns(p),
    hints: [
      `Son ${a} grupos iguales de ${b}, así que multiplica: ${a} × ${b}.`,
      level === 3
        ? `Separa ${a} en partes: ${tens} × ${b} = ${tens * b} y ${a - tens} × ${b} = ${(a - tens) * b}.`
        : `Cuenta sumando ${b} cada vez, ${a} veces: ${Array.from({ length: Math.min(a - 1, 4) }, (_, i) => b * (i + 1)).join(', ')}, y así sucesivamente.`,
      `${a} × ${b} = ${p}.`,
    ],
    mistakes: [{ value: a + b, text: `Sumaste. Hay ${a} grupos con ${b} en cada uno, así que multiplica.` }],
  };
}

function divFacts(level, theme, rng) {
  const b = level === 1 ? int(rng, 2, 5) : level === 2 ? int(rng, 3, 9) : int(rng, 6, 12);
  const q = level === 1 ? int(rng, 2, 6) : level === 2 ? int(rng, 4, 9) : int(rng, 7, 15);
  const total = b * q;
  return {
    prompt: say(theme, {
      jewelry: `Tienes ${total} cuentas. Cada collar usa ${b} cuentas. ¿Cuántos collares puedes hacer?`,
      fabric: `Un rollo tiene ${total} pies de listón. Cada moño usa ${b} pies. ¿Cuántos moños puedes hacer?`,
      runway: `${total} modelos se reparten en equipos de ${b}. ¿Cuántos equipos hay?`,
    }),
    ...intAns(q),
    hints: [
      `Repartir ${total} en grupos de ${b} significa dividir: ${total} ÷ ${b}.`,
      `Pregúntate: ¿${b} por qué número da ${total}?`,
      `${b} × ${q} = ${total}, así que ${total} ÷ ${b} = ${q}.`,
    ],
    mistakes: [
      { value: total * b, text: 'Multiplicaste. Repartir en grupos iguales significa dividir.' },
      { value: total - b, text: 'Restaste un grupo. Busca cuántos grupos caben, y eso significa dividir.' },
    ],
  };
}

function fracEquiv(level, theme, rng) {
  const d = pick(rng, [[2, 3, 4], [3, 4, 5, 6, 8], [5, 6, 8, 9, 10]][level - 1]);
  let n = int(rng, 1, d - 1);
  while (gcd(n, d) !== 1) n -= 1;
  const k = level === 1 ? int(rng, 2, 3) : level === 2 ? int(rng, 2, 5) : int(rng, 3, 7);
  const D = d * k;
  return {
    prompt: say(theme, {
      jewelry: `Un diseño dice que ${n}/${d} de las cuentas son doradas. El contador de cuentas cuenta en ${D} partes iguales. Completa el espacio en blanco: ${n}/${d} = ?/${D}`,
      fabric: `Un patrón usa ${n}/${d} de yarda. Tu regla está marcada en ${D} partes iguales por yarda. Completa el espacio en blanco: ${n}/${d} = ?/${D}`,
      runway: `${n}/${d} del desfile es ropa de noche. El horario tiene ${D} espacios iguales. Completa el espacio en blanco: ${n}/${d} = ?/${D}`,
    }),
    ...intAns(n * k),
    hints: [
      `¿Por qué número multiplicas ${d} para obtener ${D}? Haz lo mismo con el número de arriba (numerador).`,
      `${D} ÷ ${d} = ${k}, así que multiplica también el número de arriba por ${k}.`,
      `${n} × ${k} = ${n * k}, así que ${n}/${d} = ${n * k}/${D}.`,
    ],
    mistakes: [{ value: n + (D - d), text: `Le sumaste ${D - d} al número de arriba. Las fracciones siguen siendo iguales cuando multiplicas el número de arriba y el de abajo por el mismo número.` }],
  };
}

function fracSimplify(level, theme, rng) {
  const d = pick(rng, [[2, 3, 4, 5], [3, 4, 5, 6, 7, 8], [5, 7, 8, 9, 11, 12]][level - 1]);
  let n = int(rng, 1, d - 1);
  while (gcd(n, d) !== 1) n -= 1;
  const k = level === 1 ? pick(rng, [2, 3]) : level === 2 ? int(rng, 2, 6) : pick(rng, [4, 6, 8, 9, 12]);
  const N = n * k;
  const D = d * k;
  return {
    prompt: say(theme, {
      jewelry: `${N} de las ${D} gemas de una corona son azules. Escribe la fracción ${N}/${D} en su forma más simple.`,
      fabric: `Usaste ${N}/${D} de un rollo de seda. Escribe ${N}/${D} en su forma más simple.`,
      runway: `${N} de los ${D} looks del desfile son rojos. Escribe ${N}/${D} en su forma más simple.`,
    }),
    ...fracAns(N, D, { requireFraction: true, simplest: true }),
    hints: [
      `Busca el número más grande que divide exactamente a ${N} y a ${D}.`,
      `Los dos se dividen entre ${k}: ${N} ÷ ${k} = ${n} y ${D} ÷ ${k} = ${d}.`,
      `Entonces ${N}/${D} = ${n}/${d}. Escríbela con la tecla /.`,
    ],
    mistakes: [],
  };
}

function decimals(level, theme, rng) {
  if (level < 3) {
    const a = level === 1 ? int(rng, 10, 60) * 10 : int(rng, 101, 999);
    const b = level === 1 ? int(rng, 5, 40) * 10 : int(rng, 101, 999);
    const cents = (a % 100) + (b % 100);
    return {
      prompt: say(theme, {
        jewelry: `Un cierre cuesta $${money(a)} y una cadena cuesta $${money(b)}. ¿Cuál es el total en dólares?`,
        fabric: `El hilo cuesta $${money(a)} y los botones cuestan $${money(b)}. ¿Cuál es el total en dólares?`,
        runway: `El brillo labial cuesta $${money(a)} y un moño para el cabello cuesta $${money(b)}. ¿Cuál es el total en dólares?`,
      }),
      ...decAns(a + b),
      hints: [
        'Alinea los puntos decimales y luego suma como si fueran números enteros.',
        `Dólares: ${Math.floor(a / 100)} + ${Math.floor(b / 100)}. Centavos: ${a % 100} + ${b % 100} = ${cents} centavos${cents >= 100 ? ', que forman un dólar más' : ''}.`,
        `$${money(a)} + $${money(b)} = $${money(a + b)}.`,
      ],
      mistakes: [{ value: Math.abs(a - b) / 100, text: 'Restaste. Un total significa sumar.' }],
    };
  }
  const bill = pick(rng, [2000, 5000]);
  const cost = int(rng, 501, bill - 101);
  return {
    prompt: say(theme, {
      jewelry: `Los aretes cuestan $${money(cost)}. Pagas con un billete de $${bill / 100}. ¿Cuánto cambio recibes?`,
      fabric: `La tela cuesta $${money(cost)}. Pagas con un billete de $${bill / 100}. ¿Cuánto cambio recibes?`,
      runway: `Los boletos para el desfile cuestan $${money(cost)}. Pagas con un billete de $${bill / 100}. ¿Cuánto cambio recibes?`,
    }),
    ...decAns(bill - cost),
    hints: [
      'El cambio es lo que pagaste menos lo que costó.',
      `Escribe el billete como $${money(bill)} y alinea los puntos decimales: ${money(bill)} − ${money(cost)}.`,
      `$${money(bill)} − $${money(cost)} = $${money(bill - cost)}.`,
    ],
    mistakes: [{ value: (bill + cost) / 100, text: 'Sumaste. Para el cambio, resta el costo de lo que pagaste.' }],
  };
}

// ---------- fractions ----------
function fracPart(level, theme, rng) {
  const d = pick(rng, [[2, 4, 5], [3, 6, 8], [8, 10, 12]][level - 1]);
  const n = int(rng, 1, d - 1);
  const k = int(rng, 2, 4 + level * 3);
  const L = d * k;
  return {
    prompt: say(theme, {
      jewelry: `Una cadena mide ${L} cm de largo. La parte del cierre usa ${n}/${d} de la cadena. ¿Cuántos cm mide la parte del cierre?`,
      fabric: `Un rollo de listón mide ${L} cm de largo. Un adorno usa ${n}/${d} del listón. ¿Cuántos cm de adorno son?`,
      runway: `La pasarela mide ${L} pies de largo. Las luces cubren ${n}/${d} de la pasarela. ¿Cuántos pies tienen luces?`,
    }),
    ...intAns(n * k),
    hints: [
      'Divide la longitud en partes iguales. El número de abajo de la fracción (denominador) te dice cuántas partes hay.',
      `Divide ${L} entre ${d} para hallar el tamaño de una parte: ${L} ÷ ${d} = ${k}.`,
      `Una parte es ${k} y necesitas ${n} partes: ${n} × ${k} = ${n * k}.`,
    ],
    mistakes: n === 1 ? [] : [{ value: k, text: `Esa es una sola parte. Necesitas ${n} partes.` }],
  };
}

function fracAdd(level, theme, rng) {
  const d = pick(rng, [[3, 4, 5], [6, 8, 10], [12, 15, 20]][level - 1]);
  const n1 = int(rng, 1, d - 2);
  const n2 = int(rng, 1, d - 1 - n1);
  const k = int(rng, 2, 4 + level * 2);
  const L = d * k;
  return {
    prompt: say(theme, {
      jewelry: `Un collar tiene ${L} cuentas. ${n1}/${d} de ellas son perlas y ${n2}/${d} son cristales. ¿Cuántas cuentas son perlas o cristales?`,
      fabric: `El patrón de una bufanda tiene ${L} rayas. ${n1}/${d} son doradas y ${n2}/${d} son plateadas. ¿Cuántas rayas son doradas o plateadas?`,
      runway: `Un desfile tiene ${L} conjuntos. ${n1}/${d} son rojos y ${n2}/${d} son negros. ¿Cuántos conjuntos son rojos o negros?`,
    }),
    ...intAns(k * (n1 + n2)),
    hints: [
      'Las fracciones tienen el mismo número de abajo (denominador), así que puedes sumar los números de arriba.',
      `${n1}/${d} + ${n2}/${d} = ${n1 + n2}/${d}. Ahora halla ${n1 + n2}/${d} de ${L}.`,
      `Una parte es ${L} ÷ ${d} = ${k}. Luego ${n1 + n2} × ${k} = ${k * (n1 + n2)}.`,
    ],
    mistakes: [
      { value: n1 + n2, text: `Ese es el número de partes. Cada parte es ${L} ÷ ${d}, así que multiplica.` },
      { value: k * n1, text: 'Eso solo cuenta el primer grupo. Primero suma las dos fracciones.' },
    ],
  };
}

function fracAddUnlike(level, theme, rng) {
  const pairs = [
    [[2, 4], [3, 6], [4, 8], [2, 6], [5, 10]],
    [[2, 3], [3, 4], [2, 5], [4, 6], [6, 8]],
    [[3, 5], [4, 5], [5, 6], [3, 8], [4, 10], [6, 9]],
  ][level - 1];
  let a = 1;
  let b = 2;
  let c = 1;
  let d = 4;
  for (let tries = 0; tries < 40; tries++) {
    [b, d] = pick(rng, pairs);
    a = int(rng, 1, b - 1);
    c = int(rng, 1, d - 1);
    if (a * d + c * b < b * d && gcd(a, b) === 1 && gcd(c, d) === 1) break; // simple parts, sum under 1
  }
  if (a * d + c * b >= b * d || gcd(a, b) !== 1 || gcd(c, d) !== 1) [a, c] = [1, 1];
  const L = lcm(b, d);
  const x = (a * L) / b;
  const y = (c * L) / d;
  const ans = fracAns(x + y, L);
  const simpler = ans.answerText !== `${x + y}/${L}` ? ` = ${ans.answerText}` : '';
  return {
    prompt: say(theme, {
      jewelry: `Un colgante usa ${a}/${b} de onza de plata y ${c}/${d} de onza de oro. ¿Cuántas onzas de metal hay en total? Responde con una fracción.`,
      fabric: `Un vestido usa ${a}/${b} de yarda de encaje y ${c}/${d} de yarda de satín. ¿Cuántas yardas usa en total? Responde con una fracción.`,
      runway: `El desfile dedica ${a}/${b} de hora a los looks casuales y ${c}/${d} de hora a los vestidos de gala. ¿Cuántas horas son en total? Responde con una fracción.`,
    }),
    ...ans,
    hints: [
      `Los números de abajo son diferentes, así que primero hazlos iguales. Un número de abajo común (denominador común) para ${b} y ${d} es ${L}.`,
      `${a}/${b} = ${x}/${L} y ${c}/${d} = ${y}/${L}.`,
      `Suma los números de arriba: ${x} + ${y} = ${x + y}, así que el total es ${x + y}/${L}${simpler}.`,
    ],
    mistakes: [{ value: (a + c) / (b + d), text: 'También sumaste los números de abajo. Haz que los de abajo sean iguales y luego suma solo los de arriba.' }],
  };
}

function fracMult(level, theme, rng) {
  let a = 1;
  let b = pick(rng, [2, 3, 4]);
  if (level > 1) {
    b = pick(rng, [3, 4, 5, 6]);
    a = int(rng, 1, b - 1);
    while (gcd(a, b) !== 1) a -= 1;
  }
  const d = level === 3 ? pick(rng, [4, 6, 8, 9]) : pick(rng, [2, 3, 4, 5]);
  let c = int(rng, 1, d - 1);
  while (gcd(c, d) !== 1) c -= 1;
  const ans = fracAns(a * c, b * d);
  const simpler = ans.answerText !== `${a * c}/${b * d}` ? ` = ${ans.answerText}` : '';
  return {
    prompt: say(theme, {
      jewelry: `Tienes ${c}/${d} de metro de cadena y usas ${a}/${b} de esa cadena para una tobillera. ¿Cuántos metros usas? Responde con una fracción.`,
      fabric: `Queda ${c}/${d} de yarda de terciopelo. Un cuello usa ${a}/${b} de esa tela. ¿Cuántas yardas mide el cuello? Responde con una fracción.`,
      runway: `El ensayo dura ${c}/${d} de hora y ${a}/${b} de ese tiempo es el final. ¿Cuántas horas dura el final? Responde con una fracción.`,
    }),
    ...ans,
    hints: [
      `"${a}/${b} de" algo significa multiplicar: ${a}/${b} × ${c}/${d}.`,
      `Multiplica los números de arriba: ${a} × ${c} = ${a * c}. Multiplica los números de abajo: ${b} × ${d} = ${b * d}.`,
      `Entonces la respuesta es ${a * c}/${b * d}${simpler}.`,
    ],
    mistakes: [
      { value: (a + c) / (b + d), text: 'Sumaste. "De" significa multiplicar los de arriba y multiplicar los de abajo.' },
      { value: (a * d) / (b * c), text: 'Volteaste una fracción. Solo multiplica derecho: arriba por arriba y abajo por abajo.' },
    ],
  };
}

// ---------- ratios, rates, percents ----------
function ratio(level, theme, rng) {
  const [aLo, aHi, bLo, bHi, kHi] = [
    [1, 3, 2, 4, 5],
    [2, 5, 3, 7, 8],
    [3, 8, 4, 9, 9],
  ][level - 1];
  const a = int(rng, aLo, aHi);
  let b = int(rng, bLo, bHi);
  if (b === a) b += 1;
  const k = int(rng, 2, kHi);
  return {
    prompt: say(theme, {
      jewelry: `El patrón de una pulsera usa ${a} cuentas doradas por cada ${b} cuentas plateadas. Usas ${a * k} cuentas doradas. ¿Cuántas cuentas plateadas necesitas?`,
      fabric: `Una mezcla de tinte necesita ${a} gotas de rosa por cada ${b} gotas de dorado. Usas ${a * k} gotas de rosa. ¿Cuántas gotas de dorado necesitas?`,
      runway: `El desfile tiene ${a} estilistas por cada ${b} modelos. Hay ${a * k} estilistas. ¿Cuántos modelos hay?`,
    }),
    ...intAns(k * b),
    hints: [
      'Averigua cuántas veces se repite el patrón básico.',
      `${a * k} ÷ ${a} = ${k}, así que el patrón se repite ${k} veces.`,
      `Cada repetición necesita ${b}: ${k} × ${b} = ${k * b}.`,
    ],
    mistakes: [{ value: b + (a * k - a), text: `Sumaste la misma cantidad a los dos. Las razones crecen al multiplicar, así que busca cuántas veces cabe ${a} en ${a * k}.` }],
  };
}

function unitRate(level, theme, rng) {
  const q = level === 1 ? int(rng, 2, 6) : int(rng, 3, 8);
  const unit = level === 3 ? pick(rng, [125, 150, 175, 225, 250, 275, 350]) : 100 * int(rng, 2, 9);
  const price = q * unit;
  const m = int(rng, 2, 9) + (level === 3 ? 1 : 0);
  const [many, one] = say(theme, { jewelry: ['pasadores para el cabello', 'pasador'], fabric: ['carretes de hilo', 'carrete'], runway: ['brillos labiales', 'brillo labial'] });
  if (level === 1) {
    return {
      prompt: `${q} ${many} cuestan $${money(price)}. ¿Cuántos dólares cuesta un ${one}?`,
      ...decAns(unit),
      hints: ['Una tasa unitaria es el precio de uno. Divide el costo total entre la cantidad que recibes.', `$${money(price)} ÷ ${q}.`, `$${money(price)} ÷ ${q} = $${money(unit)} cada uno.`],
      mistakes: [{ value: (price * q) / 100, text: 'Multiplicaste. Para hallar el precio de uno, divide el costo entre la cantidad que recibes.' }],
    };
  }
  return {
    prompt: `${q} ${many} cuestan $${money(price)}. Al mismo precio, ¿cuántos dólares cuestan ${m}?`,
    ...decAns(unit * m),
    hints: ['Primero halla el precio de uno y luego multiplica.', `Uno cuesta $${money(price)} ÷ ${q} = $${money(unit)}.`, `${m} × $${money(unit)} = $${money(unit * m)}.`],
    mistakes: [
      { value: (price * m) / 100, text: `Ese es el precio de ${q}, multiplicado por ${m}. Primero halla el precio de uno.` },
      { value: unit / 100, text: `Ese es el precio de uno. Ahora multiplica por ${m}.` },
    ],
  };
}

function fdpConvert(level, theme, rng) {
  if (level === 1) {
    const [n, d] = pick(rng, [[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5], [1, 10], [3, 10], [7, 10]]);
    const p = (100 * n) / d;
    return {
      prompt: say(theme, {
        jewelry: `${n}/${d} de los anillos están en oferta. ¿Qué porcentaje es eso?`,
        fabric: `${n}/${d} de la tela es de algodón. ¿Qué porcentaje es eso?`,
        runway: `${n}/${d} de los asientos están ocupados. ¿Qué porcentaje es eso?`,
      }),
      ...intAns(p),
      hints: ['Porcentaje significa "de cada 100". Haz que el número de abajo sea 100.', `100 ÷ ${d} = ${100 / d}, así que multiplica el número de arriba por ${100 / d}: ${n}/${d} = ${p}/100.`, `${p}/100 = ${p}%.`],
      mistakes: [{ value: n / d, text: 'Ese es el decimal. Porcentaje significa de cada 100, así que multiplica por 100.' }],
    };
  }
  if (level === 2) {
    const p = int(rng, 1, 19) * 5;
    const dec = p / 100;
    return {
      prompt: say(theme, {
        jewelry: `Una báscula de gemas marca ${dec}. Escribe ${dec} como porcentaje.`,
        fabric: `Una tabla de telas dice que se usó ${dec} del rollo. Escribe ${dec} como porcentaje.`,
        runway: `Una encuesta muestra que a ${dec} del público le encantó el desfile. Escribe ${dec} como porcentaje.`,
      }),
      ...intAns(p),
      hints: ['Para convertir un decimal en porcentaje, multiplica por 100.', 'Multiplicar por 100 mueve el punto decimal dos lugares a la derecha.', `${dec} × 100 = ${p}, así que es ${p}%.`],
      mistakes: [{ value: p / 10, text: 'Mueve el punto decimal dos lugares, no uno.' }],
    };
  }
  const [n, d] = pick(rng, [[3, 20], [7, 20], [9, 25], [12, 25], [17, 50], [1, 8], [3, 8]]);
  const p = (100 * n) / d;
  return {
    prompt: say(theme, {
      jewelry: `Hoy se vendieron ${n} de ${d} pulseras. ¿Qué porcentaje se vendió?`,
      fabric: `${n} de ${d} patrones están terminados. ¿Qué porcentaje está terminado?`,
      runway: `${n} de ${d} looks recibieron una ovación de pie. ¿Qué porcentaje es eso?`,
    }),
    ...(Number.isInteger(p) ? intAns(p) : { answer: p, answerText: String(p), form: 'decimal' }),
    hints: [`Escríbelo como fracción, ${n}/${d}, y luego busca cuánto es de cada 100.`, `Divide: ${n} ÷ ${d} = ${n / d}.`, `${n / d} × 100 = ${p}, así que es ${p}%.`],
    mistakes: [{ value: n / d, text: 'Ese es el decimal. Multiplica por 100 para obtener el porcentaje.' }],
  };
}

function percentOf(level, theme, rng) {
  const pct = pick(rng, [[10, 50, 25], [20, 30, 40, 75], [15, 35, 60, 45]][level - 1]);
  const N = 20 * int(rng, 2, level === 3 ? 20 : 10);
  const part = (N * pct) / 100;
  return {
    prompt: say(theme, {
      jewelry: `Una tienda tiene ${N} anillos. El ${pct}% de ellos tiene gemas. ¿Cuántos anillos tienen gemas?`,
      fabric: `Un pedido tiene ${N} camisas. El ${pct}% está terminado. ¿Cuántas camisas están terminadas?`,
      runway: `${N} personas vinieron al desfile. El ${pct}% era del equipo de diseño. ¿Cuántas personas del equipo de diseño vinieron?`,
    }),
    ...intAns(part),
    hints: [
      `${pct}% significa ${pct} de cada 100. Primero halla el 10% o el 1%.`,
      pct % 10 === 0 ? `El 10% de ${N} es ${N / 10}. Necesitas ${pct / 10} de esos.` : `El 1% de ${N} es ${N / 100}. Necesitas ${pct} de esos.`,
      `El ${pct}% de ${N} = ${pct}/100 × ${N} = ${part}.`,
    ],
    mistakes: [
      { value: N - part, text: `Esa es la otra parte. La pregunta pide la parte del ${pct}%.` },
      { value: N * pct, text: 'Recuerda dividir entre 100. Porcentaje significa de cada 100.' },
    ],
  };
}

function percent(level, theme, rng) {
  const pct = pick(rng, [[10, 20, 25, 50], [15, 30, 35, 45], [12, 18, 24, 36]][level - 1]);
  const P = level === 1 ? 20 * int(rng, 2, 10) : level === 2 ? 20 * int(rng, 3, 15) : 50 * int(rng, 2, 8);
  const disc = (P * pct) / 100;
  return {
    prompt: say(theme, {
      jewelry: `Un colgante cuesta $${P}. Hoy tiene ${pct}% de descuento. ¿Cuál es el precio de oferta en dólares?`,
      fabric: `Una bufanda de seda cuesta $${P}. La etiqueta dice ${pct}% de descuento. ¿Cuál es el precio de oferta en dólares?`,
      runway: `Unas botas de pasarela cuestan $${P}. Tienen ${pct}% de descuento. ¿Cuál es el precio de oferta en dólares?`,
    }),
    ...intAns(P - disc),
    hints: [
      'Primero encuentra el descuento. Un porcentaje es una parte de 100.',
      `El ${pct}% de ${P} es ${pct}/100 × ${P} = ${disc}.`,
      `Resta el descuento del precio: ${P} − ${disc} = ${P - disc}.`,
    ],
    mistakes: [
      { value: disc, text: 'Ese es el descuento. La pregunta pide el precio de oferta, así que réstalo del precio.' },
      { value: P + disc, text: 'Sumaste el descuento. En una oferta, el precio baja.' },
      { value: P - pct, text: `Le quitaste $${pct}. Necesitas el ${pct}% de $${P}, que es otro número.` },
    ],
  };
}

// ---------- negatives and algebra ----------
function intAdd(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = a + int(rng, 1, 8);
    const ans = a - b;
    return {
      prompt: say(theme, {
        jewelry: `Tu presupuesto para joyas es $${a}. Gastas $${b}. ¿Cuál es tu saldo ahora? (Usa − para el dinero que debes.)`,
        fabric: `Afuera del estudio hace ${a}°F. La temperatura baja ${b} grados. ¿Cuál es la temperatura ahora?`,
        runway: `El desfile en la montaña empieza a ${a}°F. En la noche, la temperatura baja ${b} grados. ¿Cuál es la temperatura en la noche?`,
      }),
      ...intAns(ans),
      hints: [`Empieza en ${a} en la recta numérica y muévete ${b} hacia la izquierda.`, `Llegas a 0 después de ${a} pasos; luego baja ${b - a} más por debajo de cero.`, `${a} − ${b} = ${ans}.`],
      mistakes: [{ value: -ans, text: 'Revisa el signo. Pasaste el cero, así que la respuesta es negativa. Usa la tecla −.' }],
    };
  }
  if (level === 2) {
    const a = -int(rng, 2, 12);
    const b = int(rng, 1, 15);
    const ans = a + b;
    return {
      prompt: say(theme, {
        jewelry: `Tu saldo es ${a} dólares porque debes dinero de materiales. Vendes un anillo por $${b}. ¿Cuál es tu saldo ahora?`,
        fabric: `El cuarto de teñido está a ${a}°C. La temperatura sube ${b} grado${b === 1 ? '' : 's'}. ¿Cuál es la temperatura ahora?`,
        runway: `Al amanecer hace ${a}°F en la pasarela de la montaña. La temperatura sube ${b} grado${b === 1 ? '' : 's'}. ¿Cuál es la temperatura ahora?`,
      }),
      ...intAns(ans),
      hints: [`Empieza en ${a} y muévete ${b} hacia la derecha.`, `Necesitas ${-a} pasos para regresar a 0.${b > -a ? ` Luego avanza ${b + a} más.` : ''}`, `${a} + ${b} = ${ans}.`],
      mistakes: [
        { value: -ans, text: 'Revisa el signo. Imagina la recta numérica: ¿de qué lado del cero terminas?' },
        { value: a - b, text: 'Cuando la temperatura sube o ganas dinero, te mueves a la derecha, así que suma.' },
      ],
    };
  }
  const a = int(rng, -5, 15);
  const b = -int(rng, 2, 15);
  const ans = a - b;
  return {
    prompt: say(theme, {
      jewelry: `Un anillo se guarda a ${a}°F y una perla se guarda a ${b}°F. ¿Cuántos grados más caliente está el anillo? Calcula ${neg(a)} − ${neg(b)}.`,
      fabric: `El estudio de Atlanta está a ${a}°F y el estudio de Oslo está a ${b}°F. ¿Cuántos grados más caliente está Atlanta? Calcula ${neg(a)} − ${neg(b)}.`,
      runway: `La pasarela está a ${a}°F y la carpa de hielo está a ${b}°F. ¿Cuántos grados más caliente está la pasarela? Calcula ${neg(a)} − ${neg(b)}.`,
    }),
    ...intAns(ans),
    hints: ['Restar un negativo es lo mismo que sumar un positivo.', `${neg(a)} − ${neg(b)} = ${a} + ${-b}.`, `${a} + ${-b} = ${ans}.`],
    mistakes: [{ value: a + b, text: 'Restar un negativo es como sumar. Cambia − (−) por +.' }],
  };
}

function intMult(level, theme, rng) {
  const tag = say(theme, { jewelry: 'Código de gema', fabric: 'Código de patrón', runway: 'Código del desfile' });
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    return {
      prompt: say(theme, {
        jewelry: `El precio de la plata baja $${a} por día durante ${b} días. ¿Cuál es el cambio total? Calcula ${b} × (−${a}).`,
        fabric: `Un rollo de tela pierde ${a} yardas por semana durante ${b} semanas. ¿Cuál es el cambio total? Calcula ${b} × (−${a}).`,
        runway: `La temperatura baja ${a} grados cada hora durante ${b} horas. ¿Cuál es el cambio total? Calcula ${b} × (−${a}).`,
      }),
      ...intAns(-a * b),
      hints: ['Un positivo por un negativo da negativo.', `${b} × ${a} = ${a * b}.`, `Entonces ${b} × (−${a}) = ${-a * b}.`],
      mistakes: [{ value: a * b, text: 'Revisa el signo: una bajada es negativa, y positivo × negativo da negativo.' }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    return {
      prompt: `${tag}: (−${a}) × (−${b}) = ?`,
      ...intAns(a * b),
      hints: ['Un negativo por un negativo da positivo.', `${a} × ${b} = ${a * b}.`, `Entonces (−${a}) × (−${b}) = ${a * b}.`],
      mistakes: [{ value: -a * b, text: 'Revisa el signo: un negativo por un negativo da positivo.' }],
    };
  }
  const b = int(rng, 2, 9);
  const q = int(rng, 2, 9) * pick(rng, [1, -1]);
  const divisor = pick(rng, [b, -b]);
  const total = q * divisor;
  return {
    prompt: `${tag}: ${total} ÷ ${neg(divisor)} = ?`,
    ...intAns(q),
    hints: ['Divide los números y luego decide el signo. Signos iguales dan positivo; signos diferentes dan negativo.', `${Math.abs(total)} ÷ ${b} = ${Math.abs(q)}.`, `La respuesta es ${q}.`],
    mistakes: [{ value: -q, text: 'Revisa el signo: signos iguales dan positivo; signos diferentes dan negativo.' }],
  };
}

function exprEval(level, theme, rng) {
  const a = int(rng, 2, level === 1 ? 6 : 9);
  const b = int(rng, 3, 20);
  const x = level === 3 ? -int(rng, 1, 6) : int(rng, 2, 9);
  const minus = level === 2;
  const val = minus ? a * x - b : a * x + b;
  const expr = minus ? `${a}h − ${b}` : `${a}h + ${b}`;
  return {
    prompt: say(theme, {
      jewelry: level === 3 ? `Una fórmula para enfriar gemas es ${a}h + ${b}. ¿Cuánto vale cuando h = ${x}?` : `Un taller de joyería cobra ${expr} dólares por h horas de trabajo. ¿Cuánto cuesta cuando h = ${x}?`,
      fabric: level === 3 ? `Una prueba de estiramiento usa la fórmula ${a}h + ${b}. ¿Cuánto vale cuando h = ${x}?` : `La fórmula de precio de un taller de costura es ${expr} dólares por h horas. ¿Cuál es el precio cuando h = ${x}?`,
      runway: level === 3 ? `Una fórmula de iluminación es ${a}h + ${b}. ¿Cuánto vale cuando h = ${x}?` : `La fórmula de precio de un servicio de estilismo es ${expr} dólares por h horas. ¿Cuál es el precio cuando h = ${x}?`,
    }),
    ...intAns(val),
    hints: [
      `Pon ${x} en lugar de h. ${a}h significa ${a} × h.`,
      `${a} × ${neg(x)} = ${a * x}. Multiplica antes de ${minus ? 'restar' : 'sumar'}.`,
      `${a * x} ${minus ? '−' : '+'} ${b} = ${val}.`,
    ],
    mistakes: [
      { value: minus ? a * (x - b) : a * (x + b), text: `Primero multiplica: calcula ${a} × ${x} antes de ${minus ? 'restar' : 'sumar'} ${b}.` },
      { value: minus ? a + x - b : a + x + b, text: `${a}h significa ${a} por h, no ${a} más h.` },
    ],
  };
}

function eqOneStep(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 3, 25);
    const x = int(rng, 2, 30);
    return {
      prompt: say(theme, {
        jewelry: `Tenías algunas cuentas y luego compraste ${a} más. Ahora tienes ${x + a}. Resuelve x + ${a} = ${x + a}.`,
        fabric: `Tenías algunas yardas de tela y conseguiste ${a} más. Ahora tienes ${x + a}. Resuelve x + ${a} = ${x + a}.`,
        runway: `Había algunos modelos detrás del escenario y luego llegaron ${a} más. Ahora hay ${x + a}. Resuelve x + ${a} = ${x + a}.`,
      }),
      ...intAns(x),
      hints: [`Deshaz la suma de ${a} restando ${a} en ambos lados.`, `x = ${x + a} − ${a}.`, `x = ${x}. Comprueba: ${x} + ${a} = ${x + a}.`],
      mistakes: [{ value: x + 2 * a, text: `Sumaste ${a}. Para deshacer + ${a}, resta ${a}.` }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const x = int(rng, 2, 12);
    return {
      prompt: say(theme, {
        jewelry: `Los dijes cuestan $${a} cada uno. Gastaste $${a * x}. ¿Cuántos compraste? Resuelve ${a}x = ${a * x}.`,
        fabric: `Los parches cuestan $${a} cada uno. Gastaste $${a * x}. ¿Cuántos compraste? Resuelve ${a}x = ${a * x}.`,
        runway: `Los boletos cuestan $${a} cada uno. Un grupo gastó $${a * x}. ¿Cuántos boletos compró? Resuelve ${a}x = ${a * x}.`,
      }),
      ...intAns(x),
      hints: [`${a}x significa ${a} por x. Deshaz la multiplicación dividiendo ambos lados entre ${a}.`, `x = ${a * x} ÷ ${a}.`, `x = ${x}. Comprueba: ${a} × ${x} = ${a * x}.`],
      mistakes: [
        { value: a * a * x, text: `Multiplicaste. Para deshacer × ${a}, divide entre ${a}.` },
        { value: a * x - a, text: `${a}x significa ${a} por x, así que divide en lugar de restar.` },
      ],
    };
  }
  const a = int(rng, 3, 15);
  const x = int(rng, -10, 10) || 4;
  const c = x - a;
  return {
    prompt: `Resuelve x − ${a} = ${c}.`,
    ...intAns(x),
    hints: [`Deshaz la resta de ${a} sumando ${a} en ambos lados.`, `x = ${neg(c)} + ${a}.`, `x = ${x}. Comprueba: ${neg(x)} − ${a} = ${c}.`],
    mistakes: [{ value: c - a, text: `Volviste a restar. Para deshacer − ${a}, suma ${a}.` }],
  };
}

function eqTwoStep(level, theme, rng) {
  const a = int(rng, 2, level === 1 ? 6 : 9);
  const x = level === 3 ? int(rng, -9, -1) : int(rng, 2, 12);
  const b = int(rng, 2, 25) * (level === 2 ? -1 : 1);
  const c = a * x + b;
  const eq = `${a}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}`;
  const prompt =
    level === 1
      ? say(theme, {
          jewelry: `Un taller de joyería cobra una tarifa de diseño de $${b} más $${a} por cada dije. El total fue $${c}. ¿Cuántos dijes? Resuelve ${eq}.`,
          fabric: `Un taller de costura cobra una tarifa de prueba de $${b} más $${a} por cada dobladillo. El total fue $${c}. ¿Cuántos dobladillos? Resuelve ${eq}.`,
          runway: `Un servicio de estilismo cobra una tarifa de reserva de $${b} más $${a} por cada look. El total fue $${c}. ¿Cuántos looks? Resuelve ${eq}.`,
        })
      : `Resuelve ${eq}.`;
  const undo = b < 0 ? `suma ${-b} a` : `resta ${b} a`;
  return {
    prompt,
    ...intAns(x),
    hints: [
      `Deshaz los pasos en orden inverso. Primero ${undo} ambos lados.`,
      `${a}x = ${c} ${b < 0 ? '+' : '−'} ${Math.abs(b)} = ${c - b}. Ahora divide ambos lados entre ${a}.`,
      `x = ${c - b} ÷ ${a} = ${x}. Comprueba: ${a} × ${neg(x)} ${b < 0 ? '−' : '+'} ${Math.abs(b)} = ${c}.`,
    ],
    mistakes: [
      { value: (c + b) / a, text: b < 0 ? `Para deshacer − ${-b}, primero suma ${-b}.` : `Para deshacer + ${b}, primero resta ${b}.` },
      { value: c / a - b, text: 'Primero deshaz la suma o la resta; luego divide.' },
    ],
  };
}

// ---------- grade 6 and 7 additions ----------
// 6.NR.1: dividing fractions
function fracDiv(level, theme, rng) {
  if (level === 1) {
    const w = int(rng, 2, 6);
    const d = pick(rng, [2, 3, 4, 5, 6, 8]);
    return {
      prompt: say(theme, {
        jewelry: `Tienes ${w} metros de cadena. Cada tobillera usa 1/${d} de metro. ¿Cuántas tobilleras puedes hacer?`,
        fabric: `Tienes ${w} yardas de listón. Cada moño usa 1/${d} de yarda. ¿Cuántos moños puedes hacer?`,
        runway: `El desfile dura ${w} horas. Cada look tiene 1/${d} de hora. ¿Cuántos looks caben?`,
      }),
      ...intAns(w * d),
      hints: [
        `¿Cuántos pedazos de 1/${d} caben en ${w}? Eso es ${w} ÷ 1/${d}.`,
        `Cada entero tiene ${d} pedazos de tamaño 1/${d}. Dividir entre 1/${d} es lo mismo que multiplicar por ${d}.`,
        `${w} × ${d} = ${w * d}.`,
      ],
      mistakes: [
        { value: w / d, text: `Eso divide ${w} en ${d} partes. La pregunta pide cuántos pedazos de tamaño 1/${d} caben, así que multiplica por ${d}.` },
        { value: w + d, text: `Sumaste. Cada entero tiene ${d} pedazos, así que multiplica.` },
      ],
    };
  }
  const b = level === 2 ? pick(rng, [2, 3, 4]) : pick(rng, [3, 4, 5, 6]);
  let a = level === 2 ? int(rng, 1, b) : int(rng, b + 1, 3 * b);
  while (gcd(a, b) !== 1) a += 1;
  const d = level === 2 ? pick(rng, [4, 6, 8]) : pick(rng, [5, 6, 8, 9, 10]);
  let c = int(rng, 1, d - 1);
  while (gcd(c, d) !== 1) c -= 1;
  const ans = fracAns(a * d, b * c);
  const raw = `${a * d}/${b * c}`;
  return {
    prompt: say(theme, {
      jewelry: `Tienes ${a}/${b} de libra de cuentas. En cada bolsa caben ${c}/${d} de libra. ¿Cuántas bolsas puedes llenar? Responde con una fracción o un número entero.`,
      fabric: `Tienes ${a}/${b} de yarda de encaje. Cada puño usa ${c}/${d} de yarda. ¿Cuántos puños puedes hacer? Responde con una fracción o un número entero.`,
      runway: `Quedan ${a}/${b} de hora. Cada pasada por la pasarela dura ${c}/${d} de hora. ¿Cuántas pasadas caben? Responde con una fracción o un número entero.`,
    }),
    ...ans,
    hints: [
      `"¿Cuántas veces cabe ${c}/${d} en ${a}/${b}?" significa ${a}/${b} ÷ ${c}/${d}.`,
      `Deja igual la primera fracción, cambia ÷ por × y voltea la segunda: ${a}/${b} × ${d}/${c}.`,
      `${a} × ${d} = ${a * d} y ${b} × ${c} = ${b * c}, así que la respuesta es ${raw}${raw !== ans.answerText ? ` = ${ans.answerText}` : ''}.`,
    ],
    mistakes: [
      { value: (a * c) / (b * d), text: 'Multiplicaste directo, de arriba con arriba y de abajo con abajo. Para dividir, primero voltea la segunda fracción y luego multiplica.' },
      { value: (b * c) / (a * d), text: 'Volteaste la primera fracción. Deja igual la primera y voltea la fracción entre la que divides.' },
    ],
  };
}

// 6.NR.1: multiplying and dividing decimals
function decMultDiv(level, theme, rng) {
  if (level === 1) {
    const p = int(rng, 105, 895);
    const n = int(rng, 2, 6);
    return {
      prompt: say(theme, {
        jewelry: `Un dije cuesta $${money(p)}. ¿Cuánto cuestan ${n} dijes?`,
        fabric: `Un carrete de hilo cuesta $${money(p)}. ¿Cuánto cuestan ${n} carretes?`,
        runway: `Un par de pestañas cuesta $${money(p)}. ¿Cuánto cuestan los pares para ${n} modelos?`,
      }),
      ...decAns(p * n),
      hints: [
        `Multiplica: ${money(p)} × ${n}.`,
        `Piensa en centavos: ${p} × ${n} = ${p * n} centavos.`,
        `${p * n} centavos son $${money(p * n)}.`,
      ],
      mistakes: [{ value: (p + n) / 100, text: `Sumaste ${n}. ${n} artículos al mismo precio significa multiplicar.` }],
    };
  }
  if (level === 2) {
    const n = int(rng, 3, 8);
    const each = int(rng, 105, 995);
    const total = each * n;
    return {
      prompt: say(theme, {
        jewelry: `${n} personas dividen en partes iguales un pedido de cuentas de $${money(total)}. ¿Cuánto paga cada persona?`,
        fabric: `${n} personas del estudio comparten una cuenta de tela de $${money(total)}. ¿Cuánto paga cada persona?`,
        runway: `${n} modelos dividen en partes iguales un taxi de $${money(total)}. ¿Cuánto paga cada modelo?`,
      }),
      ...decAns(each),
      hints: [
        `Divide: ${money(total)} ÷ ${n}.`,
        `Piensa en centavos: ${total} ÷ ${n} = ${each} centavos.`,
        `Cada persona paga $${money(each)}.`,
      ],
      mistakes: [{ value: (total * n) / 100, text: 'Multiplicaste. Repartir una cuenta significa dividir.' }],
    };
  }
  let t = int(rng, 11, 39); // tenths of a yard
  if (t % 10 === 0) t += 1; // keep one decimal place
  const c = 10 * int(rng, 12, 60); // price in cents, a multiple of 10
  const cents = (t * c) / 10;
  return {
    prompt: say(theme, {
      jewelry: `El alambre de plata cuesta $${money(c)} por metro. Compras ${t / 10} metros. ¿Cuánto cuesta?`,
      fabric: `El terciopelo cuesta $${money(c)} por yarda. Compras ${t / 10} yardas. ¿Cuánto cuesta?`,
      runway: `La cinta para la pasarela cuesta $${money(c)} por metro. Necesitas ${t / 10} metros. ¿Cuánto cuesta?`,
    }),
    ...decAns(cents),
    hints: [
      `Multiplica: ${t / 10} × ${money(c)}.`,
      `Primero ignora los puntos decimales: ${t} × ${c / 10} = ${t * (c / 10)}. Luego cuenta los lugares decimales: uno en ${t / 10} y uno en ${(c / 100).toFixed(1)}, así que dos en total.`,
      `${t / 10} × ${money(c)} = $${money(cents)}.`,
    ],
    mistakes: [],
  };
}

// 6.PAR.7 and 7.PAR.3: inequalities (the answer is the boundary, or the smallest whole number that works)
function inequalities(level, theme, rng) {
  if (level === 1) {
    const b = int(rng, 3, 20);
    const x = int(rng, 4, 30);
    const c = x + b;
    return {
      prompt: say(theme, {
        jewelry: `Tienes ${b} cuentas y necesitas más de ${c} para un collar. Resuelve b + ${b} > ${c}. b > ¿qué número?`,
        fabric: `Tienes ${b} pies de ribete y necesitas más de ${c}. Resuelve t + ${b} > ${c}. t > ¿qué número?`,
        runway: `Hay ${b} asientos ocupados y el desfile necesita más de ${c}. Resuelve s + ${b} > ${c}. s > ¿qué número?`,
      }),
      ...intAns(x),
      hints: [
        'Resuélvela como una ecuación. Deshaz el + restando en ambos lados.',
        `Resta ${b}: ${c} − ${b} = ${x}.`,
        `Entonces la respuesta es mayor que ${x}. El límite es ${x}.`,
      ],
      mistakes: [{ value: c + b, text: `Para deshacer + ${b}, resta ${b}; no lo sumes.` }],
    };
  }
  if (level === 2) {
    const a = int(rng, 2, 9);
    const x = int(rng, 3, 15);
    const c = a * x;
    return {
      prompt: say(theme, {
        jewelry: `Cada anillo cuesta $${a}. Puedes gastar como máximo $${c}. Resuelve ${a}r ≤ ${c}. r ≤ ¿qué número?`,
        fabric: `Cada parche cuesta $${a}. Tu límite es $${c}. Resuelve ${a}p ≤ ${c}. p ≤ ¿qué número?`,
        runway: `Cada look toma ${a} minutos. El desfile puede durar como máximo ${c} minutos. Resuelve ${a}m ≤ ${c}. m ≤ ¿qué número?`,
      }),
      ...intAns(x),
      hints: [
        `Deshaz la multiplicación dividiendo ambos lados entre ${a}. Al dividir entre un número positivo, el signo se queda igual.`,
        `${c} ÷ ${a} = ${x}.`,
        `Entonces la respuesta es como máximo ${x}. El límite es ${x}.`,
      ],
      mistakes: [{ value: c - a, text: `${a}r significa ${a} por r. Deshazlo dividiendo, no restando.` }],
    };
  }
  const a = int(rng, 3, 9);
  const b = int(rng, 10, 40);
  const goal = int(rng, 30, 120);
  const exact = (goal + b) / a;
  const ans = Math.floor(exact) + 1; // smallest whole number with a·n − b > goal
  return {
    prompt: say(theme, {
      jewelry: `Las pulseras se venden a $${a} cada una y la mesa en la feria de artesanías cuesta $${b}. ¿Cuántas pulseras debes vender para tener más de $${goal} de ganancia? Resuelve ${a}n − ${b} > ${goal}. ¿Cuál es el número entero más pequeño que funciona?`,
      fabric: `Las bolsas de tela se venden a $${a} cada una y el puesto cuesta $${b}. ¿Cuántas debes vender para tener más de $${goal} de ganancia? Resuelve ${a}n − ${b} > ${goal}. ¿Cuál es el número entero más pequeño que funciona?`,
      runway: `Los boletos del desfile se venden a $${a} cada uno y las luces cuestan $${b}. ¿Cuántos boletos debes vender para ganar más de $${goal}? Resuelve ${a}n − ${b} > ${goal}. ¿Cuál es el número entero más pequeño que funciona?`,
    }),
    ...intAns(ans),
    hints: [
      `Primero suma ${b} a ambos lados: ${a}n > ${goal + b}.`,
      `Divide entre ${a}: n > ${Number.isInteger(exact) ? exact : `${goal + b}/${a}, que es aproximadamente ${exact.toFixed(2)}`}.`,
      `n tiene que ser mayor que eso, así que el número entero más pequeño es ${ans}.`,
    ],
    mistakes: [
      { value: Math.floor(exact), text: Number.isInteger(exact) ? `Con exactamente ${exact} ganas exactamente $${goal}. Necesitas más que eso.` : `${Math.floor(exact)} no es suficiente. Comprueba: ${a} × ${Math.floor(exact)} − ${b} no es mayor que ${goal}. Redondea hacia arriba.` },
      { value: Math.floor((goal - b) / a) + 1, text: `El costo de la mesa se resta, así que primero suma ${b} a ambos lados.` },
    ],
  };
}

// 7.PAR.2: equivalent expressions
function exprEquiv(level, theme, rng) {
  if (level === 1) {
    const a = int(rng, 2, 9);
    const b = int(rng, 2, 9);
    const k = int(rng, 2, 15);
    return {
      prompt: say(theme, {
        jewelry: `Una bandeja tiene ${a}x anillos, luego ${k} perlas más y ${b}x anillos más. Simplifica ${a}x + ${k} + ${b}x = ?x + ${k}. ¿Qué número va delante de la x?`,
        fabric: `Un patrón usa ${a}x pulgadas, luego ${k} pulgadas y luego ${b}x pulgadas. Simplifica ${a}x + ${k} + ${b}x = ?x + ${k}. ¿Qué número va delante de la x?`,
        runway: `Un desfile tiene ${a}x looks, ${k} moños y luego ${b}x looks más. Simplifica ${a}x + ${k} + ${b}x = ?x + ${k}. ¿Qué número va delante de la x?`,
      }),
      ...intAns(a + b),
      hints: [
        `Los términos semejantes tienen la misma letra. ${a}x y ${b}x son términos semejantes; ${k} no lo es.`,
        `Suma los términos con x: ${a}x + ${b}x.`,
        `${a} + ${b} = ${a + b}, así que queda ${a + b}x + ${k}.`,
      ],
      mistakes: [{ value: a + b + k, text: `${k} no tiene x, así que no es un término semejante. Suma solo los números que van delante de la x.` }],
    };
  }
  const a = level === 2 ? int(rng, 2, 9) : -int(rng, 2, 9);
  const b = level === 2 ? int(rng, 2, 12) : -int(rng, 2, 12);
  const inside = `x ${b < 0 ? '−' : '+'} ${Math.abs(b)}`;
  const prod = a * b;
  return {
    prompt:
      level === 2
        ? say(theme, {
            jewelry: `Hay ${a} cajas de regalo, y cada caja tiene x anillos y ${b} aretes: ${a}(${inside}). Completa el espacio en blanco: ${a}(${inside}) = ${a}x + ?`,
            fabric: `Hay ${a} conjuntos, y cada conjunto usa x botones y ${b} broches de presión: ${a}(${inside}). Completa el espacio en blanco: ${a}(${inside}) = ${a}x + ?`,
            runway: `Hay ${a} modelos, y cada modelo lleva x prendedores y ${b} pinzas: ${a}(${inside}). Completa el espacio en blanco: ${a}(${inside}) = ${a}x + ?`,
          })
        : `Usa la propiedad distributiva. Completa el espacio en blanco: ${a}(${inside}) = ${a}x + ?`,
    ...intAns(prod),
    hints: [
      `Multiplica ${neg(a)} por cada término dentro de los paréntesis.`,
      `${neg(a)} × x = ${a}x y ${neg(a)} × ${neg(b)} = ?`,
      `${neg(a)} × ${neg(b)} = ${prod}, así que ${a}(${inside}) = ${a}x + ${neg(prod)}.`,
    ],
    mistakes: [
      { value: b, text: `Multiplica ${neg(a)} por los dos términos de adentro, no solo por x.` },
      { value: a + b, text: `Sumaste ${neg(a)} y ${neg(b)}. La propiedad distributiva multiplica.` },
    ],
  };
}

// 7.PAR.4: proportional relationships and scale drawings
function proportion(level, theme, rng) {
  if (level === 1) {
    const k = 50 * int(rng, 3, 18); // cents per unit
    const x1 = int(rng, 2, 5);
    const x2 = x1 + int(rng, 1, 4);
    return {
      prompt: say(theme, {
        jewelry: `${x1} metros de cadena cuestan $${money(k * x1)} y ${x2} metros cuestan $${money(k * x2)}. El costo es proporcional. ¿Cuál es la tasa unitaria (dólares por metro)?`,
        fabric: `${x1} yardas de seda cuestan $${money(k * x1)} y ${x2} yardas cuestan $${money(k * x2)}. El costo es proporcional. ¿Cuál es el costo por yarda?`,
        runway: `${x1} horas de iluminación cuestan $${money(k * x1)} y ${x2} horas cuestan $${money(k * x2)}. El costo es proporcional. ¿Cuál es el costo por hora?`,
      }),
      ...decAns(k),
      hints: [
        'En una relación proporcional, y ÷ x siempre da lo mismo. Ese número es la tasa unitaria, k.',
        `Divide: ${money(k * x1)} ÷ ${x1}.`,
        `k = $${money(k)}. Comprueba: ${money(k * x2)} ÷ ${x2} da lo mismo.`,
      ],
      mistakes: [
        { value: (k * x1) / 100, text: `Eso es el costo de ${x1}. La tasa unitaria es el costo de 1, así que divide entre ${x1}.` },
        { value: (k * (x2 - x1)) / 100, text: `Eso es el costo de los ${x2 - x1} extra. Divide un costo entre su cantidad para obtener el costo de 1.` },
      ],
    };
  }
  if (level === 2) {
    const s = pick(rng, [2, 4, 5, 6, 8, 10]);
    const halves = int(rng, 3, 19);
    const d = halves / 2;
    const real = halves * s / 2;
    return {
      prompt: say(theme, {
        jewelry: `En un plano de exhibición, 1 cm representa ${s} cm de la vitrina real. La vitrina mide ${d} cm de largo en el plano. ¿Cuánto mide la vitrina real, en cm?`,
        fabric: `En el boceto de un patrón, 1 pulgada representa ${s} pulgadas de tela. Una manga mide ${d} pulgadas en el boceto. ¿Cuánto mide la manga real?`,
        runway: `En un plano del escenario, 1 cm representa ${s} metros. La pasarela mide ${d} cm en el plano. ¿Cuánto mide la pasarela real, en metros?`,
      }),
      ...(Number.isInteger(real) ? intAns(real) : decAns(Math.round(real * 100))),
      hints: [
        `Cada 1 unidad del dibujo equivale a ${s} unidades reales, así que multiplica por ${s}.`,
        `${d} × ${s}.`,
        `${d} × ${s} = ${Number.isInteger(real) ? real : money(Math.round(real * 100))}.`,
      ],
      mistakes: [
        { value: d / s, text: `El dibujo es más pequeño que el objeto real, así que la medida real es más grande. Multiplica por ${s}.` },
        { value: d + s, text: `La escala significa "por ${s}", no "más ${s}".` },
      ],
    };
  }
  const a = int(rng, 2, 5);
  let b = int(rng, 3, 11);
  if (b === a) b += 1;
  const m = int(rng, 3, 6);
  return {
    prompt: say(theme, {
      jewelry: `${a} collares necesitan ${b} metros de cadena. Con la misma proporción, ¿cuántos metros se necesitan para ${a * m} collares?`,
      fabric: `${a} vestidos necesitan ${b} yardas de tela. Con la misma proporción, ¿cuántas yardas se necesitan para ${a * m} vestidos?`,
      runway: `${a} desfiles necesitan ${b} horas de ensayo. Con la misma proporción, ¿cuántas horas se necesitan para ${a * m} desfiles?`,
    }),
    ...intAns(b * m),
    hints: [
      `Plantea razones iguales: ${a}/${b} = ${a * m}/?`,
      `${a * m} es ${m} veces ${a}, así que la respuesta es ${m} veces ${b}.`,
      `${b} × ${m} = ${b * m}.`,
    ],
    mistakes: [
      { value: b + (a * m - a), text: `Sumaste ${a * m - a}. Las proporciones crecen multiplicando: ${a * m} es ${m} veces ${a}.` },
      { value: (a * m * a) / b, text: 'Invertiste la razón. Pon lo mismo arriba en las dos razones.' },
    ],
  };
}

// 6.GSR.5: area, volume and surface area
function areaVolume(level, theme, rng) {
  if (level === 1) {
    const b = 2 * int(rng, 2, 10);
    const h = int(rng, 3, 12);
    return {
      prompt: say(theme, {
        jewelry: `Un dije triangular tiene una base de ${b} mm y una altura de ${h} mm. ¿Cuál es su área en mm cuadrados?`,
        fabric: `Una bufanda triangular tiene una base de ${b} pulgadas y una altura de ${h} pulgadas. ¿Cuál es su área en pulgadas cuadradas?`,
        runway: `Una pancarta triangular tiene una base de ${b} pies y una altura de ${h} pies. ¿Cuál es su área en pies cuadrados?`,
      }),
      ...intAns((b * h) / 2),
      hints: [
        'Un triángulo es la mitad de un rectángulo con la misma base y la misma altura.',
        `Rectángulo: ${b} × ${h} = ${b * h}. Ahora toma la mitad.`,
        `${b * h} ÷ 2 = ${(b * h) / 2}.`,
      ],
      mistakes: [{ value: b * h, text: 'Eso es el rectángulo completo. Un triángulo es la mitad, así que divide entre 2.' }],
    };
  }
  const l = int(rng, 2, 9);
  const w = int(rng, 2, 8);
  const h = int(rng, 2, 7);
  const vol = l * w * h;
  const sa = 2 * (l * w + l * h + w * h);
  const what = say(theme, { jewelry: 'un joyero', fabric: 'una caja de regalo', runway: 'una caja de zapatos' });
  if (level === 2) {
    return {
      prompt: `Tienes ${what} que mide ${l} pulgadas de largo, ${w} pulgadas de ancho y ${h} pulgadas de alto. ¿Cuál es su volumen en pulgadas cúbicas?`,
      ...intAns(vol),
      hints: ['El volumen de una caja es largo × ancho × alto.', `${l} × ${w} = ${l * w} para la capa de abajo.`, `${l * w} × ${h} = ${vol} pulgadas cúbicas.`],
      mistakes: [
        { value: l + w + h, text: 'Sumaste los lados. El volumen multiplica el largo, el ancho y el alto.' },
        { value: l * w, text: `Eso es una sola capa. Hay ${h} capas, así que multiplica por ${h}.` },
        { value: sa, text: 'Eso es el área de superficie, o sea, el papel para envolver. El volumen es cuánto cabe adentro.' },
      ],
    };
  }
  return {
    prompt: `Quieres forrar ${what} con papel. Mide ${l} pulgadas de largo, ${w} pulgadas de ancho y ${h} pulgadas de alto. ¿Cuál es su área de superficie en pulgadas cuadradas?`,
    ...intAns(sa),
    hints: [
      'Una caja tiene 6 caras en 3 pares iguales: arriba y abajo, frente y atrás, y los dos extremos.',
      `Una de cada par: ${l}×${w} = ${l * w}, ${l}×${h} = ${l * h}, ${w}×${h} = ${w * h}. Súmalas y luego duplica el resultado.`,
      `${l * w} + ${l * h} + ${w * h} = ${sa / 2}, y el doble es ${sa}.`,
    ],
    mistakes: [
      { value: vol, text: 'Eso es el volumen. El área de superficie suma el área de las 6 caras.' },
      { value: sa / 2, text: 'Eso cubre solo 3 caras. Cada cara tiene una pareja igual, así que duplícalo.' },
    ],
  };
}

// 7.GSR.5: circles (use 3.14 for pi)
function circles(level, theme, rng) {
  const thing = say(theme, { jewelry: 'un dije redondo', fabric: 'una falda circular', runway: 'un escenario redondo' });
  const unit = say(theme, { jewelry: 'cm', fabric: 'pulgadas', runway: 'pies' });
  const sqWord = unit === 'pulgadas' ? 'cuadradas' : 'cuadrados';
  if (level === 1) {
    const d = int(rng, 2, 20);
    return {
      prompt: `El diámetro de ${thing} es de ${d} ${unit}. Usa 3.14 para pi. ¿Cuál es su circunferencia, es decir, la distancia alrededor?`,
      ...decAns(314 * d),
      hints: ['Circunferencia = pi × diámetro.', `3.14 × ${d}.`, `3.14 × ${d} = ${money(314 * d)} ${unit}.`],
      mistakes: [{ value: (314 * d) / 200, text: 'Usaste la mitad del diámetro. La circunferencia es pi por el diámetro completo.' }],
    };
  }
  const r = int(rng, 2, 12);
  if (level === 2) {
    return {
      prompt: `El radio de ${thing} es de ${r} ${unit}. Usa 3.14 para pi. ¿Cuál es su circunferencia?`,
      ...decAns(628 * r),
      hints: [`El diámetro es el doble del radio: ${2 * r} ${unit}.`, `Circunferencia = 3.14 × ${2 * r}.`, `3.14 × ${2 * r} = ${money(628 * r)} ${unit}.`],
      mistakes: [{ value: (314 * r) / 100, text: 'Usaste el radio como si fuera el diámetro. Primero duplica el radio.' }],
    };
  }
  return {
    prompt: `El radio de ${thing} es de ${r} ${unit}. Usa 3.14 para pi. ¿Cuál es su área en ${unit} ${sqWord}?`,
    ...decAns(314 * r * r),
    hints: ['Área de un círculo = pi × radio × radio.', `3.14 × ${r} × ${r} = 3.14 × ${r * r}.`, `3.14 × ${r * r} = ${money(314 * r * r)} ${unit} ${sqWord}.`],
    mistakes: [
      { value: (628 * r) / 100, text: 'Eso es la circunferencia. El área es pi × radio × radio.' },
      { value: (314 * 4 * r * r) / 100, text: 'Elevaste el diámetro al cuadrado. Usa el radio.' },
    ],
  };
}

// 6.PAR.8: the coordinate plane
function coordPlane(level, theme, rng) {
  const place = say(theme, { jewelry: 'una cuadrícula de exhibición', fabric: 'la cuadrícula de un tapete de corte', runway: 'la cuadrícula del escenario' });
  if (level < 3) {
    const y = level === 1 ? int(rng, 1, 9) : int(rng, -9, 9);
    const x1 = level === 1 ? int(rng, 1, 6) : -int(rng, 1, 9);
    const x2 = level === 1 ? x1 + int(rng, 2, 9) : int(rng, 1, 9);
    const dist = x2 - x1;
    return {
      prompt: `En ${place}, una marca está en (${x1}, ${y}) y otra está en (${x2}, ${y}). ¿A cuántas unidades de distancia están?`,
      ...intAns(dist),
      hints: [
        'Los valores de y son iguales, así que los puntos están en la misma línea horizontal. Cuenta de lado a lado.',
        level === 1 ? `Resta los valores de x: ${x2} − ${x1}.` : `De ${x1} a 0 hay ${-x1} unidades. De 0 a ${x2} hay ${x2} unidades.`,
        `${level === 1 ? `${x2} − ${x1}` : `${-x1} + ${x2}`} = ${dist} unidades.`,
      ],
      mistakes: level === 1 ? [{ value: x1 + x2, text: 'La distancia es la diferencia entre los valores de x, así que resta.' }] : [{ value: Math.abs(x2 + x1), text: `Los puntos están en lados opuestos del 0. Suma las distancias hasta el 0: ${-x1} + ${x2}.` }],
    };
  }
  const a = int(rng, 1, 6);
  const c = int(rng, 1, 6);
  const b = int(rng, 1, 6);
  const e = int(rng, 1, 6);
  const w = a + c;
  const h = b + e;
  return {
    prompt: `En ${place}, un rectángulo tiene sus esquinas en (−${a}, ${b}), (${c}, ${b}), (${c}, −${e}) y (−${a}, −${e}). ¿Cuál es su perímetro?`,
    ...intAns(2 * (w + h)),
    hints: [
      `Ancho: de x = −${a} a x = ${c} hay ${a} + ${c} = ${w}.`,
      `Alto: de y = −${e} a y = ${b} hay ${e} + ${b} = ${h}.`,
      `Perímetro = 2 × (${w} + ${h}) = ${2 * (w + h)}.`,
    ],
    mistakes: [
      { value: w * h, text: 'Eso es el área. El perímetro es la distancia alrededor.' },
      { value: w + h, text: 'Eso cuenta solo dos lados. Un rectángulo tiene cuatro, así que duplícalo.' },
      { value: 2 * (Math.abs(c - a) + Math.abs(b - e)), text: 'Las esquinas están a los dos lados del 0, así que suma las distancias hasta el 0.' },
    ],
  };
}

// 7.PR.6: probability
function probability(level, theme, rng) {
  const [itemA, itemB, itemC] = say(theme, { jewelry: ['de color rosa', 'de color morado', 'de color dorado'], fabric: ['de rayas', 'de un solo color', 'de flores'], runway: ['de color rojo', 'de color negro', 'de color blanco'] });
  const things = say(theme, { jewelry: 'cuentas', fabric: 'retazos', runway: 'boletos' });
  const container = say(theme, { jewelry: 'una bolsa', fabric: 'un cesto', runway: 'un sombrero' });
  // Spanish agreement words for the noun in `things` (no rng used)
  const [los, una, la] = say(theme, { jewelry: ['las', 'una', 'la'], fabric: ['los', 'uno', 'lo'], runway: ['los', 'uno', 'lo'] });
  if (level === 1) {
    const p = int(rng, 1, 9);
    const q = int(rng, 1, 9);
    const ans = fracAns(p, p + q);
    return {
      prompt: `En ${container} hay ${p} ${things} ${itemA} y ${q} ${itemB}. Sacas ${una} sin mirar. ¿Cuál es la probabilidad de que sea ${itemA}? Responde con una fracción.`,
      ...ans,
      hints: ['Probabilidad = resultados favorables ÷ resultados totales.', `Hay ${p} ${itemA} de un total de ${p} + ${q} = ${p + q}.`, `${p}/${p + q}${`${p}/${p + q}` !== ans.answerText ? ` = ${ans.answerText}` : ''}.`],
      mistakes: [{ value: p / q, text: `Compara ${los} ${things} ${itemA} con el total de ${things}, no solo con ${los} ${itemB}.` }],
    };
  }
  if (level === 2) {
    const p = int(rng, 1, 8);
    const q = int(rng, 1, 8);
    const r = int(rng, 1, 8);
    const t = p + q + r;
    const ans = fracAns(t - r, t);
    return {
      prompt: `En ${container} hay ${p} ${things} ${itemA}, ${q} ${itemB} y ${r} ${itemC}. Sacas ${una} sin mirar. ¿Cuál es la probabilidad de que NO sea ${itemC}? Responde con una fracción.`,
      ...ans,
      hints: [`"Que no sea ${itemC}" significa que es ${itemA} o ${itemB}.`, `${p} + ${q} = ${t - r} de un total de ${t}.`, `${t - r}/${t}${`${t - r}/${t}` !== ans.answerText ? ` = ${ans.answerText}` : ''}.`],
      mistakes: [{ value: r / t, text: `Esa es la probabilidad de que SÍ sea ${itemC}. Tú buscas todas las demás opciones.` }],
    };
  }
  const p = int(rng, 1, 4);
  const q = int(rng, 1, 6);
  const t = p + q;
  const k = int(rng, 3, 12);
  const n = t * k;
  return {
    prompt: `En ${container} hay ${p} ${things} ${itemA} y ${q} ${itemB}. Sacas ${una}, ${la} regresas y haces esto ${n} veces. ¿Más o menos cuántas veces debes esperar sacar ${una} ${itemA}?`,
    ...intAns(p * k),
    hints: [`La probabilidad de sacar ${una} ${itemA} cada vez es ${p}/${t}.`, `Cantidad esperada = probabilidad × número de intentos = ${p}/${t} × ${n}.`, `${n} ÷ ${t} = ${k}, y ${k} × ${p} = ${p * k}.`],
    mistakes: [
      { value: n / p, text: `Multiplica la probabilidad, ${p}/${t}, por ${n}.` },
      { value: q * k, text: `Eso es cuántas veces esperas sacar ${una} ${itemB}. La pregunta es sobre ${los} ${things} ${itemA}.` },
    ],
  };
}

// ---------- grade 8 ----------

// 8.NR.2: integer exponents
function exponents(level, theme, rng) {
  const lead = say(theme, { jewelry: 'La cantidad de cuentas en un collar de varias capas crece por potencias.', fabric: 'Un patrón se duplica y se triplica al repetirse.', runway: 'Las vistas del desfile crecen por potencias.' });
  if (level === 1) {
    const b = int(rng, 2, 5);
    const n = b === 5 ? int(rng, 2, 3) : int(rng, 2, 4);
    const v = b ** n;
    return {
      prompt: `${lead} ¿Cuánto es ${b}${sup(n)}?`,
      ...intAns(v),
      hints: [`${b}${sup(n)} significa ${n} copias de ${b} multiplicadas entre sí.`, `${Array(n).fill(b).join(' × ')}.`, `${Array(n).fill(b).join(' × ')} = ${v}.`],
      mistakes: [{ value: b * n, text: `Eso es ${b} × ${n}. El exponente dice cuántas veces se usa el ${b} en la multiplicación.` }],
    };
  }
  const b = int(rng, 2, 9);
  if (level === 2) {
    const m = int(rng, 2, 7);
    const n = int(rng, 2, 6);
    const kind = int(rng, 0, 2);
    if (kind === 0) {
      return {
        prompt: `${lead} ${b}${sup(m)} × ${b}${sup(n)} es igual a ${b} elevado a una potencia. ¿Cuál es esa potencia? Escribe el exponente.`,
        ...intAns(m + n),
        hints: ['Cuando multiplicas potencias de la misma base, sumas los exponentes.', `${m} copias de ${b} y luego ${n} copias más.`, `${m} + ${n} = ${m + n}, así que es ${b}${sup(m + n)}.`],
        mistakes: [{ value: m * n, text: 'Al multiplicar potencias con la misma base, se suman los exponentes. Los exponentes se multiplican cuando es una potencia de una potencia.' }],
      };
    }
    if (kind === 1) {
      const top = m + n;
      return {
        prompt: `${lead} ${b}${sup(top)} ÷ ${b}${sup(n)} es igual a ${b} elevado a una potencia. ¿Cuál es esa potencia? Escribe el exponente.`,
        ...intAns(m),
        hints: ['Cuando divides potencias de la misma base, restas los exponentes.', `${n} de los ${b} de arriba se cancelan con los ${b} de abajo.`, `${top} − ${n} = ${m}, así que es ${b}${sup(m)}.`],
        mistakes: [{ value: top + n, text: 'Al dividir potencias con la misma base, se restan los exponentes.' }],
      };
    }
    return {
      prompt: `${lead} (${b}${sup(m)})${sup(n)} es igual a ${b} elevado a una potencia. ¿Cuál es esa potencia? Escribe el exponente.`,
      ...intAns(m * n),
      hints: ['En una potencia de una potencia, se multiplican los exponentes.', `Son ${n} copias de ${b}${sup(m)}, y cada una tiene ${m} veces el ${b}.`, `${m} × ${n} = ${m * n}, así que es ${b}${sup(m * n)}.`],
      mistakes: [{ value: m + n, text: 'En una potencia de una potencia, multiplica los exponentes en vez de sumarlos.' }],
    };
  }
  if (rng() < 0.3) {
    const c = int(rng, 3, 12);
    return {
      prompt: `${lead} ¿Cuánto es ${c}${sup(0)}?`,
      ...intAns(1),
      hints: ['Mira el patrón: cada vez que el exponente baja 1, divides entre la base.', `${c}${sup(1)} = ${c}, y ${c} ÷ ${c} = 1.`, `Cualquier número distinto de cero elevado a la potencia 0 es 1.`],
      mistakes: [
        { value: 0, text: 'Una potencia 0 no da 0. Divide una vez más desde la potencia 1: la respuesta es 1.' },
        { value: c, text: `Eso es ${c}${sup(1)}. Bajar un paso más divide entre ${c}.` },
      ],
    };
  }
  const bb = int(rng, 2, 5);
  const n = bb >= 4 ? 2 : int(rng, 2, 3);
  const p = bb ** n;
  return {
    prompt: `${lead} Escribe ${bb}${sup(-n)} como fracción.`,
    ...fracAns(1, p, { requireFraction: true }),
    hints: ['Un exponente negativo significa uno sobre la potencia positiva.', `${bb}${sup(-n)} = 1 / ${bb}${sup(n)}.`, `${bb}${sup(n)} = ${p}, así que la respuesta es 1/${p}.`],
    mistakes: [
      { value: -p, text: 'Un exponente negativo no hace que el número sea negativo. Significa uno sobre la potencia.' },
      { value: -bb * n, text: 'Un exponente negativo significa uno sobre la potencia, no un número negativo.' },
    ],
  };
}

// 8.NR.1, 8.NR.2: square roots and cube roots
function sqRoots(level, theme, rng) {
  const tile = say(theme, { jewelry: 'dije cuadrado', fabric: 'parche cuadrado de colcha', runway: 'panel cuadrado del escenario' });
  const unit = say(theme, { jewelry: 'mm', fabric: 'pulgadas', runway: 'pies' });
  const sqWord = unit === 'pulgadas' ? 'cuadradas' : 'cuadrados';
  const cubeWord = unit === 'pulgadas' ? 'cúbicas' : 'cúbicos';
  if (level === 1) {
    const k = int(rng, 2, 15);
    return {
      prompt: `¿Cuánto es √${k * k}?`,
      ...intAns(k),
      hints: ['La raíz cuadrada pregunta: ¿qué número multiplicado por sí mismo da este número?', `Prueba ${k - 1} × ${k - 1} = ${(k - 1) ** 2}. Necesitas uno un poco más grande.`, `${k} × ${k} = ${k * k}, así que √${k * k} = ${k}.`],
      mistakes: [{ value: (k * k) / 2, text: 'La raíz cuadrada no es la mitad. Es el número que, multiplicado por sí mismo, da el total.' }],
    };
  }
  if (level === 2) {
    if (rng() < 0.5) {
      const k = int(rng, 3, 14);
      return {
        prompt: `Un ${tile} tiene un área de ${k * k} ${unit} ${sqWord}. ¿Cuánto mide cada lado?`,
        ...intAns(k),
        hints: ['Área de un cuadrado = lado × lado.', `Busca el número que multiplicado por sí mismo da ${k * k}: eso es √${k * k}.`, `${k} × ${k} = ${k * k}, así que cada lado mide ${k} ${unit}.`],
        mistakes: [{ value: (k * k) / 4, text: 'Dividir entre 4 da el lado a partir del perímetro. Para el área, saca la raíz cuadrada.' }],
      };
    }
    const k = int(rng, 2, 6);
    return {
      prompt: `Una caja de regalo en forma de cubo tiene un volumen de ${k ** 3} ${unit} ${cubeWord}. ¿Cuánto es ∛${k ** 3}, la longitud de cada arista?`,
      ...intAns(k),
      hints: ['La raíz cúbica pregunta: ¿qué número, usado 3 veces en una multiplicación, da este número?', `Prueba ${k - 1} × ${k - 1} × ${k - 1} = ${(k - 1) ** 3}.`, `${k} × ${k} × ${k} = ${k ** 3}, así que la arista mide ${k} ${unit}.`],
      mistakes: [{ value: k ** 3 / 3, text: 'La raíz cúbica no es la tercera parte. Es el número que se usa 3 veces en una multiplicación.' }],
    };
  }
  const k = int(rng, 3, 11);
  const n = k * k + int(rng, 1, 2 * k);
  return {
    prompt: `√${n} no es un número entero. Está entre dos números enteros seguidos. ¿Cuál es el menor de los dos?`,
    ...intAns(k),
    hints: ['Busca los cuadrados perfectos que están justo abajo y justo arriba.', `${k}² = ${k * k} y ${k + 1}² = ${(k + 1) ** 2}.`, `${k * k} < ${n} < ${(k + 1) ** 2}, así que √${n} está entre ${k} y ${k + 1}. El menor es ${k}.`],
    mistakes: [
      { value: k + 1, text: 'Ese es el mayor de los dos. La pregunta pide el menor.' },
      { value: Math.floor(n / 2), text: 'La raíz cuadrada no es la mitad. Busca los cuadrados perfectos cercanos.' },
    ],
  };
}

// 8.NR.2: scientific notation
function sciNotation(level, theme, rng) {
  const things = say(theme, { jewelry: 'cuentas', fabric: 'puntadas', runway: 'vistas' });
  if (level === 1) {
    let m = int(rng, 11, 99);
    if (m % 10 === 0) m += 1;
    const e = int(rng, 3, 8);
    const N = m * 10 ** (e - 1);
    const c = (m / 10).toFixed(1);
    return {
      prompt: `El estudio contó ${commas(N)} ${things} este año. En notación científica, eso es ${c} × 10 elevado a una potencia. ¿Cuál es el exponente?`,
      ...intAns(e),
      hints: ['Mueve el punto decimal a la izquierda hasta que quede un solo dígito delante de él. Cuenta los movimientos.', `${commas(N)} se convierte en ${c}.`, `El punto se movió ${e} lugares, así que ${commas(N)} = ${c} × 10${sup(e)}. El exponente es ${e}.`],
      mistakes: [{ value: e - 1, text: 'Eso cuenta solo los ceros. Cuenta cada lugar que se mueve el punto decimal, pasando por cada dígito.' }],
    };
  }
  if (level === 2) {
    const a = int(rng, 1, 4);
    const b = int(rng, 2, Math.floor(9 / a));
    const p = int(rng, 2, 8);
    const q = int(rng, 2, 6);
    return {
      prompt: `(${a} × 10${sup(p)}) × (${b} × 10${sup(q)}) = ${a * b} × 10 elevado a una potencia. ¿Cuál es el exponente? Escríbelo.`,
      ...intAns(p + q),
      hints: ['Multiplica los números de adelante y luego multiplica las potencias de 10.', `${a} × ${b} = ${a * b}. Para 10${sup(p)} × 10${sup(q)}, suma los exponentes.`, `${p} + ${q} = ${p + q}, así que ${a * b} × 10${sup(p + q)}.`],
      mistakes: [{ value: p * q, text: 'Al multiplicar potencias de 10, los exponentes se suman.' }],
    };
  }
  const c = int(rng, 2, 9);
  const q = int(rng, 3, 6);
  const d = int(rng, 2, 4);
  const p = q + d;
  const times = 10 ** d;
  return {
    prompt: `Un video de la pasarela tiene ${c} × 10${sup(p)} vistas. Otro tiene ${c} × 10${sup(q)} vistas. ¿Cuántas veces más vistas tiene el primero?`,
    ...intAns(times),
    hints: ['Los números de adelante son iguales, así que compara las potencias de 10.', `10${sup(p)} ÷ 10${sup(q)} = 10${sup(p - q)}.`, `10${sup(d)} = ${commas(times)}, así que son ${times} veces más.`],
    mistakes: [{ value: d, text: `${d} es la diferencia de los exponentes. La respuesta es 10 elevado a esa potencia.` }],
  };
}

// 8.PAR.3: equations with variables on both sides
function eqMultiStep(level, theme, rng) {
  const cx = (c) => (c === 1 ? 'x' : `${c}x`);
  if (level === 1) {
    const x = int(rng, -6, 9);
    const a = int(rng, 3, 9);
    const c = int(rng, 1, a - 1);
    const b = int(rng, 1, 20);
    const d = (a - c) * x + b;
    return {
      prompt: `Resuelve para x: ${a}x + ${b} = ${cx(c)} + ${neg(d)}`,
      ...intAns(x),
      hints: [`Pasa los términos con x a un solo lado: resta ${cx(c)} en ambos lados.`, `${a - c}x + ${b} = ${d}. Ahora resta ${b}: ${a - c}x = ${d - b}.`, `x = ${d - b} ÷ ${a - c} = ${x}.`],
      mistakes: [
        { value: (d - b) / (a + c), text: `Resta ${cx(c)} en ambos lados en vez de sumarlo.` },
        { value: (d + b) / (a - c), text: `Para deshacer + ${b}, resta ${b} en ambos lados.` },
      ],
    };
  }
  if (level === 2) {
    const x = int(rng, -5, 9);
    const a = int(rng, 2, 6);
    const b = int(rng, 1, 8);
    const c = int(rng, 1, a - 1);
    const d = a * (x + b) - c * x;
    return {
      prompt: `Resuelve para x: ${a}(x + ${b}) = ${cx(c)} + ${neg(d)}`,
      ...intAns(x),
      hints: [`Primero distribuye: ${a}(x + ${b}) = ${a}x + ${a * b}.`, `${a}x + ${a * b} = ${cx(c)} + ${d}. Resta ${cx(c)} y ${a * b}: ${a - c}x = ${d - a * b}.`, `x = ${d - a * b} ÷ ${a - c} = ${x}.`],
      mistakes: [{ value: (d - b) / (a - c), text: `Multiplica el ${a} por los dos términos dentro del paréntesis: la x y el ${b}.` }],
    };
  }
  const h = int(rng, 2, 12);
  const s = int(rng, 2, 8);
  const r = s + int(rng, 1, 5);
  const p = int(rng, 2, 10) * 5;
  const q = p + (r - s) * h;
  const what = say(theme, { jewelry: 'una mesa de joyería', fabric: 'un taller de costura', runway: 'un estudio de fotografía' });
  return {
    prompt: `Para rentar ${what}, el Estudio A cobra $${p} más $${r} por hora. El Estudio B cobra $${q} más $${s} por hora. ¿Después de cuántas horas cuestan lo mismo?`,
    ...intAns(h),
    hints: [`Escríbelo como ecuación: ${p} + ${r}h = ${q} + ${s}h.`, `Resta ${s}h y ${p} en ambos lados: ${r - s}h = ${q - p}.`, `h = ${q - p} ÷ ${r - s} = ${h} horas.`],
    mistakes: [{ value: (q - p) / (r + s), text: `Resta ${s}h en ambos lados. Las tarifas por hora se restan, no se suman.` }],
  };
}

// 8.PAR.4, 8.FGR.5: slope and y-intercept
function slope(level, theme, rng) {
  const place = say(theme, { jewelry: 'el boceto de una cadena', fabric: 'una línea de corte en la cuadrícula', runway: 'una rampa en el plano del escenario' });
  if (level === 1) {
    const m = int(rng, 1, 5);
    const x1 = int(rng, 0, 4);
    const dx = int(rng, 1, 4);
    const y1 = int(rng, 0, 10);
    const x2 = x1 + dx;
    const y2 = y1 + m * dx;
    return {
      prompt: `En ${place}, una línea recta pasa por (${x1}, ${y1}) y (${x2}, ${y2}). ¿Cuál es su pendiente?`,
      ...intAns(m),
      hints: ['Pendiente = subida ÷ avance = cambio en y ÷ cambio en x.', `Subida: ${y2} − ${y1} = ${y2 - y1}. Avance: ${x2} − ${x1} = ${dx}.`, `${y2 - y1} ÷ ${dx} = ${m}.`],
      mistakes: [
        { value: dx / (m * dx), text: 'Eso es avance sobre subida. La pendiente es subida sobre avance: el cambio en y va arriba.' },
        { value: m * dx, text: `Esa es la subida. Divídela entre el avance, ${dx}.` },
      ],
    };
  }
  if (level === 2) {
    const sign = rng() < 0.6 ? -1 : 1;
    const pairs = [[1, 2], [2, 3], [3, 2], [1, 3], [3, 4], [2, 5], [4, 3]];
    const [pp, qq] = pick(rng, pairs);
    const k = int(rng, 1, 2);
    const dy = sign * pp * k;
    const dx = qq * k;
    const x1 = int(rng, -4, 3);
    const y1 = int(rng, -3, 8);
    const x2 = x1 + dx;
    const y2 = y1 + dy;
    const ans = fracAns(dy, dx, { simplest: true });
    return {
      prompt: `En ${place}, una línea recta pasa por (${x1}, ${y1}) y (${x2}, ${y2}). ¿Cuál es su pendiente? Puedes responder con una fracción.`,
      ...ans,
      hints: ['Pendiente = cambio en y ÷ cambio en x. Una línea que baja hacia la derecha tiene pendiente negativa.', `Cambio en y: ${y2} − ${neg(y1)} = ${dy}. Cambio en x: ${x2} − ${neg(x1)} = ${dx}.`, k === 1 ? `Pendiente = ${ans.answerText}.` : `${dy}/${dx} se simplifica a ${ans.answerText}.`],
      mistakes: [{ value: dx / dy, text: 'Eso es avance sobre subida. Pon el cambio en y arriba.' }],
    };
  }
  const m = pick(rng, [-4, -3, -2, 2, 3, 4, 5]);
  const x1 = int(rng, 1, 5);
  const b = int(rng, -8, 12);
  const y1 = m * x1 + b;
  return {
    prompt: `Una línea de la forma y = mx + b tiene pendiente ${m} y pasa por (${x1}, ${y1}). ¿Cuál es b, la intersección con el eje y?`,
    ...intAns(b),
    hints: [`Sustituye el punto en y = ${m}x + b: ${y1} = ${m} × ${x1} + b.`, `${m} × ${x1} = ${m * x1}, así que ${y1} = ${m * x1} + b.`, `b = ${y1} − ${neg(m * x1)} = ${b}.`],
    mistakes: [
      { value: y1 + m * x1, text: `Resta ${m * x1} de ${y1} para obtener b, en vez de sumarlo.` },
      { value: y1 - x1, text: `Primero multiplica la pendiente por x: ${m} × ${x1}.` },
    ],
  };
}

// 8.FGR.5, 8.FGR.6: linear functions and trend lines
function linearModels(level, theme, rng) {
  const job = say(theme, { jewelry: 'un anillo hecho a la medida', fabric: 'un trabajo de sastrería', runway: 'una sesión de fotos' });
  const r = int(rng, 3, 15) * 5;
  const c = int(rng, 2, 12) * 5;
  const xs = level === 1 ? [1, 2, 3] : [2, 3, 4];
  const table = xs.map((x) => `${x} ${x === 1 ? 'hora' : 'horas'}: $${r * x + c}`).join(', ');
  if (level === 1) {
    return {
      prompt: `El precio de ${job} sube la misma cantidad cada hora. ${table}. ¿Cuál es la tasa de cambio, en dólares por hora?`,
      ...intAns(r),
      hints: ['Tasa de cambio = cuánto sube el precio por cada hora más.', `De 1 hora a 2 horas: ${r * 2 + c} − ${r + c}.`, `${r * 2 + c} − ${r + c} = ${r} dólares por hora.`],
      mistakes: [{ value: r + c, text: 'Ese es el precio de 1 hora, con la tarifa inicial incluida. Busca cuánto sube cada hora.' }],
    };
  }
  if (level === 2) {
    return {
      prompt: `El precio de ${job} es una tarifa inicial más la misma cantidad cada hora. ${table}. ¿Cuál es la tarifa inicial, es decir, el precio a las 0 horas?`,
      ...intAns(c),
      hints: [`Primero encuentra la tasa: ${r * 3 + c} − ${r * 2 + c} = ${r} por hora.`, `Regresa de 2 horas a 0 horas: quita ${r} dos veces.`, `${r * 2 + c} − ${2 * r} = ${c} dólares.`],
      mistakes: [
        { value: r, text: 'Esa es la tarifa por hora. La tarifa inicial es el precio a las 0 horas.' },
        { value: r + c, text: 'Ese es el precio de 1 hora. Regresa una hora más para llegar a 0.' },
      ],
    };
  }
  const m = int(rng, 2, 9);
  const b = int(rng, 5, 40);
  const w = int(rng, 6, 20);
  const what = say(theme, { jewelry: 'pulseras vendidas', fabric: 'bufandas vendidas', runway: 'boletos vendidos' });
  return {
    prompt: `Un diagrama de dispersión de ${what} cada semana tiene una línea de tendencia y = ${m}x + ${b}, donde x es el número de la semana. Úsala para predecir y en la semana ${w}.`,
    ...intAns(m * w + b),
    hints: [`Sustituye x = ${w} en y = ${m}x + ${b}.`, `${m} × ${w} = ${m * w}.`, `${m * w} + ${b} = ${m * w + b}.`],
    mistakes: [
      { value: m * w, text: `Recuerda sumar el valor inicial, ${b}.` },
      { value: m + w + b, text: `${m}x significa ${m} por x. Multiplica antes de sumar.` },
    ],
  };
}

// 8.FGR.7: systems of linear equations
function systems(level, theme, rng) {
  if (level < 3) {
    const x = int(rng, -4, 8);
    const a = int(rng, 2, 6);
    const c = int(rng, -3, a - 1);
    const b = int(rng, -10, 10);
    const y = a * x + b;
    const d = y - c * x;
    const cx = c === 1 ? 'x' : c === -1 ? '−x' : c === 0 ? '' : `${c}x`;
    const right = c === 0 ? `${d}` : `${cx}${d < 0 ? ` − ${-d}` : ` + ${d}`}`;
    const left = `${a}x${b < 0 ? ` − ${-b}` : ` + ${b}`}`;
    const sys = `la primera es y = ${left} y la segunda es y = ${right}`;
    if (level === 1) {
      return {
        prompt: `Hay dos líneas: ${sys}. Se cruzan en un punto. ¿Cuál es el valor de x en ese punto?`,
        ...intAns(x),
        hints: ['Donde las líneas se cruzan, los dos valores de y son iguales. Iguala los lados derechos.', `${left} = ${right}.`, `Resuélvelo: ${a - c}x = ${d - b}, así que x = ${x}.`],
        mistakes: [{ value: y, text: 'Ese es el valor de y en el cruce. La pregunta pide el valor de x.' }],
      };
    }
    return {
      prompt: `Hay dos líneas: ${sys}. Se cruzan en un punto. ¿Cuál es el valor de y en ese punto?`,
      ...intAns(y),
      hints: [`Iguálalas: ${left} = ${right}. Eso da x = ${x}.`, `Sustituye x = ${x} en y = ${left}.`, `y = ${a} × ${neg(x)} + ${neg(b)} = ${y}.`],
      mistakes: [{ value: x, text: `Ese es el valor de x. Sustitúyelo en cualquiera de las dos ecuaciones para hallar y.` }],
    };
  }
  const item = say(theme, { jewelry: ['dijes de oro', 'dijes de plata'], fabric: ['bufandas de seda', 'bufandas de algodón'], runway: ['boletos de primera fila', 'boletos normales'] });
  const pa = int(rng, 6, 15);
  const pb = int(rng, 2, pa - 2);
  const xa = int(rng, 3, 20);
  const xb = int(rng, 3, 20);
  const total = xa + xb;
  const cost = pa * xa + pb * xb;
  return {
    prompt: `La boutique vendió ${total} ${item[0].split(' ')[0]} en total: ${item[0]} a $${pa} por unidad y ${item[1]} a $${pb} por unidad. El total fue $${cost}. ¿Qué cantidad de ${item[0]} se vendió?`,
    ...intAns(xa),
    hints: [`Sea g = ${item[0]} y s = ${item[1]}: g + s = ${total} y ${pa}g + ${pb}s = ${cost}.`, `Si las ${total} piezas fueran ${item[1]}: ${pb} × ${total} = ${pb * total}. Los $${cost - pb * total} de más vienen de la venta de ${item[0]}.`, `Cada una de esas piezas suma $${pa - pb} más, así que ${cost - pb * total} ÷ ${pa - pb} = ${xa}.`],
    mistakes: [{ value: xb, text: `Esa es la cantidad de ${item[1]} vendida. La pregunta es sobre ${item[0]}.` }],
  };
}

// 8.GSR.8: the Pythagorean theorem
function pythagorean(level, theme, rng) {
  const [a, b, c] = pick(rng, TRIPLES);
  const unit = say(theme, { jewelry: 'mm', fabric: 'pulgadas', runway: 'pies' });
  if (level === 1) {
    const what = say(theme, { jewelry: 'Un colgante triangular', fabric: 'Un parche de esquina', runway: 'Una rampa del escenario' });
    return {
      prompt: `${what} tiene forma de triángulo rectángulo, con catetos de ${a} y ${b} ${unit}. ¿Cuánto mide el lado más largo, la hipotenusa?`,
      ...intAns(c),
      hints: ['a² + b² = c², donde c es la hipotenusa.', `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}.`, `c = √${c * c} = ${c} ${unit}.`],
      mistakes: [
        { value: a + b, text: 'Sumaste los lados. Elévalos al cuadrado, súmalos y luego saca la raíz cuadrada.' },
        { value: c * c, text: `Eso es c². Saca la raíz cuadrada para obtener c.` },
      ],
    };
  }
  if (level === 2) {
    const what = say(theme, { jewelry: 'un exhibidor', fabric: 'una mesa de corte', runway: 'un telón de fondo' });
    return {
      prompt: `Una viga de apoyo de ${c} ${unit} está recargada contra ${what}. Su extremo de abajo está a ${a} ${unit} de la base. ¿Hasta qué altura llega?`,
      ...intAns(b),
      hints: ['La viga es la hipotenusa: a² + b² = c².', `${a}² + b² = ${c}², así que b² = ${c * c} − ${a * a} = ${b * b}.`, `b = √${b * b} = ${b} ${unit}.`],
      mistakes: [
        { value: c - a, text: 'Resta los cuadrados, no los lados: c² − a², y luego saca la raíz cuadrada.' },
        { value: Math.sqrt(a * a + c * c), text: 'La viga ya es el lado más largo. Resta los cuadrados en vez de sumarlos.' },
      ],
    };
  }
  const x1 = int(rng, -6, 3);
  const y1 = int(rng, -6, 3);
  const sx = rng() < 0.5 ? 1 : -1;
  const x2 = x1 + a;
  const y2 = y1 + sx * b;
  const place = say(theme, { jewelry: 'la cuadrícula del exhibidor', fabric: 'la cuadrícula del tapete de corte', runway: 'la cuadrícula del escenario' });
  return {
    prompt: `En ${place}, ¿qué distancia hay en línea recta de (${x1}, ${y1}) a (${x2}, ${y2})?`,
    ...intAns(c),
    hints: [`Forma un triángulo rectángulo. De lado a lado: ${x2} − ${neg(x1)} = ${a}. Hacia arriba o hacia abajo: ${Math.abs(y2 - y1)}.`, `${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c}.`, `La distancia es √${c * c} = ${c}.`],
    mistakes: [{ value: a + b, text: 'Eso es caminar por las líneas de la cuadrícula. La línea recta es la hipotenusa: eleva al cuadrado, suma y saca la raíz cuadrada.' }],
  };
}

// 8.GSR.8: volume of cylinders, cones and spheres (use 3.14 for pi)
function volumeCurved(level, theme, rng) {
  const unit = say(theme, { jewelry: 'cm', fabric: 'pulgadas', runway: 'pies' });
  const cubic = say(theme, { jewelry: 'cm cúbicos', fabric: 'pulgadas cúbicas', runway: 'pies cúbicos' });
  if (level === 1) {
    const r = int(rng, 1, 6);
    const h = int(rng, 2, 10);
    const what = say(theme, { jewelry: 'Una lata redonda para cuentas', fabric: 'Un estuche para carretes de hilo', runway: 'Una base redonda de exhibición' });
    return {
      prompt: `${what} es un cilindro con radio de ${r} ${unit} y altura de ${h} ${unit}. Usa 3.14 para pi. ¿Cuál es su volumen en ${cubic}?`,
      ...decAns(314 * r * r * h),
      hints: ['Volumen de un cilindro = pi × radio × radio × altura.', `Área de la base: 3.14 × ${r} × ${r} = ${money(314 * r * r)}.`, `${money(314 * r * r)} × ${h} = ${money(314 * r * r * h)} ${cubic}.`],
      mistakes: [
        { value: (314 * 4 * r * r * h) / 100, text: 'Usaste el diámetro. Usa el radio: la mitad del ancho.' },
        { value: (628 * r * h) / 100, text: 'Usaste 2 × radio en vez de radio × radio.' },
      ],
    };
  }
  if (level === 2) {
    const r = int(rng, 1, 6);
    const h = 3 * int(rng, 1, 4);
    const what = say(theme, { jewelry: 'Un molde para aretes en forma de cono', fabric: 'Un cono de estambre', runway: 'Una lámpara en forma de cono' });
    return {
      prompt: `${what} tiene radio de ${r} ${unit} y altura de ${h} ${unit}. Usa 3.14 para pi. ¿Cuál es su volumen en ${cubic}?`,
      ...decAns((314 * r * r * h) / 3),
      hints: ['Un cono contiene un tercio de lo que contiene un cilindro con la misma base y la misma altura.', `Cilindro: 3.14 × ${r} × ${r} × ${h} = ${money(314 * r * r * h)}.`, `${money(314 * r * r * h)} ÷ 3 = ${money((314 * r * r * h) / 3)} ${cubic}.`],
      mistakes: [{ value: (314 * r * r * h) / 100, text: 'Ese es el volumen del cilindro. Un cono es un tercio de él, así que divide entre 3.' }],
    };
  }
  const r = pick(rng, [3, 6]);
  const what = say(theme, { jewelry: 'Una cuenta de vidrio', fabric: 'Un alfiletero redondo', runway: 'Una bola disco gigante' });
  const cents = (314 * 4 * r ** 3) / 3;
  return {
    prompt: `${what} es una esfera con radio de ${r} ${unit}. Usa 3.14 para pi. ¿Cuál es su volumen en ${cubic}?`,
    ...decAns(cents),
    hints: ['Volumen de una esfera = 4/3 × pi × radio × radio × radio.', `${r} × ${r} × ${r} = ${r ** 3}, y 3.14 × ${r ** 3} = ${money(314 * r ** 3)}.`, `${money(314 * r ** 3)} × 4 ÷ 3 = ${money(cents)} ${cubic}.`],
    mistakes: [
      { value: (314 * r ** 3) / 100, text: 'Recuerda multiplicar por 4/3.' },
      { value: (314 * 4 * r * r) / 300, text: 'Usa el radio tres veces: radio × radio × radio.' },
    ],
  };
}

export const GENERATORS_ES = {
  mult_facts: multFacts,
  div_facts: divFacts,
  frac_equiv: fracEquiv,
  frac_simplify: fracSimplify,
  decimals,
  frac_part: fracPart,
  frac_add: fracAdd,
  frac_add_unlike: fracAddUnlike,
  frac_mult: fracMult,
  ratio,
  unit_rate: unitRate,
  fdp_convert: fdpConvert,
  percent_of: percentOf,
  percent,
  int_add: intAdd,
  int_mult: intMult,
  expr_eval: exprEval,
  eq_one_step: eqOneStep,
  eq_two_step: eqTwoStep,
  frac_div: fracDiv,
  dec_mult_div: decMultDiv,
  inequalities,
  expr_equiv: exprEquiv,
  proportion,
  area_volume: areaVolume,
  circles,
  coord_plane: coordPlane,
  probability,
  exponents,
  sq_roots: sqRoots,
  sci_notation: sciNotation,
  eq_multi_step: eqMultiStep,
  slope,
  linear_models: linearModels,
  systems,
  pythagorean,
  volume_curved: volumeCurved,
};
