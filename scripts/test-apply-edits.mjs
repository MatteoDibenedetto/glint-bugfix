/**
 * Tests for lib/anthropic/apply-edits.ts.
 *
 * That module turns the model's find/replace edits into the file content that
 * gets deployed to a live theme, and it is the one place where a subtle bug
 * produces plausible-looking wrong content rather than an error. The project has
 * no test runner, so this runs on its own:
 *
 *   node scripts/test-apply-edits.mjs
 */

import { applyEdits } from '../lib/anthropic/apply-edits.ts'

let pass = 0
let fail = 0

function check(name, fn) {
  try {
    fn()
    pass++
    console.log(`  ok    ${name}`)
  } catch (err) {
    fail++
    console.log(`  FAIL  ${name}\n        ${err.message}`)
  }
}

function eq(actual, expected) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function throws(fn, fragment) {
  try {
    fn()
  } catch (err) {
    if (!err.message.includes(fragment)) {
      throw new Error(`wrong error: ${err.message}`)
    }
    return
  }
  throw new Error('expected a throw, got none')
}

const LIQUID = `<div class="product">
  <h1 class="title">{{ product.title }}</h1>
  <span class="price">{{ product.price }}</span>
  <button class="btn">Add to cart</button>
</div>
`

console.log('exact match')
check('replaces a unique snippet', () => {
  const out = applyEdits('t.liquid', LIQUID, [
    { find: '<button class="btn">Add to cart</button>', replace: '<button class="btn btn--primary">Aggiungi</button>' },
  ])
  eq(out.includes('btn--primary'), true)
  eq(out.includes('Add to cart'), false)
  // everything else untouched
  eq(out.includes('{{ product.title }}'), true)
})

check('leaves the rest of the file byte-identical', () => {
  const out = applyEdits('t.liquid', LIQUID, [{ find: 'Add to cart', replace: 'Aggiungi' }])
  eq(out, LIQUID.replace('Add to cart', 'Aggiungi'))
})

console.log('whitespace tolerance')
check('matches despite reflowed indentation', () => {
  const out = applyEdits('t.liquid', LIQUID, [
    { find: '<h1 class="title">{{ product.title }}</h1>', replace: '<h2>{{ product.title }}</h2>' },
  ])
  eq(out.includes('<h2>{{ product.title }}</h2>'), true)
})

check('matches a multi-line snippet with different indentation', () => {
  const out = applyEdits('t.liquid', LIQUID, [
    {
      find: '<span class="price">{{ product.price }}</span>\n<button class="btn">Add to cart</button>',
      replace: '<span class="price">SALE</span>',
    },
  ])
  eq(out.includes('SALE'), true)
  eq(out.includes('Add to cart'), false)
})

console.log('refusals — these must throw, never guess')
check('rejects a snippet that is not present', () => {
  throws(
    () => applyEdits('t.liquid', LIQUID, [{ find: 'does not exist anywhere', replace: 'x' }]),
    'not in the file'
  )
})

check('rejects an ambiguous snippet', () => {
  const dup = 'a\n<p>hello</p>\nb\n<p>hello</p>\nc'
  throws(() => applyEdits('t.liquid', dup, [{ find: '<p>hello</p>', replace: 'x' }]), 'more than once')
})

check('a unique exact match wins over an ambiguous fuzzy one', () => {
  // Both lines match once whitespace is ignored, but only the second matches
  // exactly — an exact quote is the strongest anchor, so it is the one applied.
  const dup = '<p>  hello  </p>\n<p> hello </p>'
  const out = applyEdits('t.liquid', dup, [{ find: '<p> hello </p>', replace: 'x' }])
  eq(out, '<p>  hello  </p>\nx')
})

check('rejects ambiguity when no exact match exists', () => {
  const dup = '<p>  hello  </p>\n<p>   hello   </p>'
  throws(() => applyEdits('t.liquid', dup, [{ find: '<p> hello </p>', replace: 'x' }]), 'more than once')
})

check('rejects an empty find', () => {
  throws(() => applyEdits('t.liquid', LIQUID, [{ find: '', replace: 'x' }]), 'empty "find"')
})

check('rejects an empty edit list', () => {
  throws(() => applyEdits('t.liquid', LIQUID, []), 'no edits')
})

console.log('regex safety')
check('treats regex metacharacters as literal text', () => {
  const css = '.price { color: red; }\n.title { color: blue; }'
  const out = applyEdits('t.css', css, [{ find: '.price { color: red; }', replace: '.price { color: green; }' }])
  eq(out, '.price { color: green; }\n.title { color: blue; }')
})

check('does not let a metacharacter snippet match the wrong place', () => {
  const src = 'value = a.b\nvalue = axb'
  throws(() => applyEdits('t.js', src, [{ find: 'value = a.b\nvalue = axb\nvalue = a?b', replace: 'x' }]), 'not in the file')
})

console.log('sequential edits')
check('applies several edits in order', () => {
  const out = applyEdits('t.liquid', LIQUID, [
    { find: 'Add to cart', replace: 'Aggiungi' },
    { find: '{{ product.price }}', replace: '{{ product.price | money }}' },
  ])
  eq(out.includes('Aggiungi'), true)
  eq(out.includes('| money'), true)
})

check('a later edit can anchor on text an earlier edit introduced', () => {
  const out = applyEdits('t.liquid', LIQUID, [
    { find: 'Add to cart', replace: 'PLACEHOLDER' },
    { find: 'PLACEHOLDER', replace: 'Aggiungi al carrello' },
  ])
  eq(out.includes('Aggiungi al carrello'), true)
})

check('a failing second edit does not leave a half-applied file', () => {
  throws(
    () =>
      applyEdits('t.liquid', LIQUID, [
        { find: 'Add to cart', replace: 'Aggiungi' },
        { find: 'nope', replace: 'x' },
      ]),
    'not in the file'
  )
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
