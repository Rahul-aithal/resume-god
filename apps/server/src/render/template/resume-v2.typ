// resume-v2 — user's preferred style, ported from their docx-js reference.
// Self-contained (no @preview package). Data via resume-data.json import.
// Multi-page by design: no page-budget trim loop.
//
// Palette: DARK #1a1a1a · MID #333333 · LIGHT #666666 · LINK #1155cc

#let dark = rgb("#1a1a1a")
#let mid = rgb("#333333")
#let light = rgb("#666666")
#let link-fill = rgb("#1155cc")
#let rule = rgb("#2c2c2c")

#let font-chain = ("Arial", "Carlito", "Liberation Sans", "DejaVu Sans")
#let size-normal = 11pt
#let size-name = 18pt
#let size-section = 12pt

#let data = json("resume-data.json")
#let contact = data.contact

#set page(paper: "us-letter", margin: (top: 0.7in, bottom: 0.7in, left: 0.7in, right: 0.7in))
#set text(font: font-chain, size: size-normal, fill: mid, lang: "en")
#set par(leading: 0.62em, spacing: 0.9em, justify: false)
#set list(indent: 0.14em, body-indent: 0.5em, spacing: 0.85em)
#set enum(indent: 0.14em, body-indent: 0.5em, spacing: 0.85em)

#show link: it => text(fill: link-fill, underline(it))
#show heading.where(level: 2): it => {
  set text(fill: dark, size: size-section, weight: "bold")
  block(
    above: 1.15em,
    below: 0.55em,
    width: 100%,
    {
      upper(it.body)
      v(-0.35em)
      line(length: 100%, stroke: 0.75pt + rule)
    },
  )
}

// ---- builders ----

#let role-header(company, title, location, dates) = {
  set text(size: size-normal)
  block(above: 1em, below: 0.45em)[
    #text(fill: dark, weight: "bold")[#company]
    #text(fill: light)[#h(0.6em) | #h(0.6em)]
    #text(fill: mid)[#emph[#title]]
    #text(fill: light)[#h(0.6em) | #h(0.6em)]
    #text(fill: light)[#location#if location != "" and dates != "" [#h(0.6em) | #h(0.6em)]#dates]
  ]
}

#let project-header(name, stack, date, url) = {
  let head = text(fill: dark, weight: "bold", name)
  if stack != "" {
    head += emph(text(fill: light, "  (" + stack + ")"))
  }
  if date != "" {
    head += text(fill: light, "  |  " + date)
  }
  if url != "" {
    head += text(fill: light, "  ")
    head += link(url, url)
  }
  block(above: 1em, below: 0.45em, head)
}

#let tech-stack(label, value) = [
  #block(above: 0.5em, below: 0.5em)[
    #text(fill: dark, weight: "bold")[#label: ]#value
  ]
]

#let bullet-line(left, right) = {
  set list(indent: 0.14em, body-indent: 0.5em, spacing: 0.85em)
  list([#left#right])
}

// ---- header ----

#block(above: 0pt, below: 0.5em)[
  #text(fill: dark, size: size-name, weight: "bold")[#contact.name]
]

#block(above: 0pt, below: 0.6em)[
  #text(fill: light)[
    #contact.location#h(0.6em) | #h(0.6em)#contact.phone#h(0.6em) | #h(0.6em)#contact.email#h(0.6em) | #h(0.6em)
    #link("https://" + contact.linkedin)[LinkedIn]#h(0.6em) | #h(0.6em)
    #link("https://github.com/" + contact.github)[GitHub]#h(0.6em) | #h(0.6em)
    #link("https://" + contact.personal_site)[Portfolio]
  ]
]

// ---- sections ----

== Summary

#data.summary

== Experience

#for section in data.sections.filter(s => s.kind == "experience") [
  #role-header(section.organization, section.role, section.location, section.dates)
  #for bullet in section.bullets [
    - #bullet
  ]
]

== Projects

#for section in data.sections.filter(s => s.kind == "project") [
  #project-header(section.name, section.tech_stack, section.dates, section.url)
  #for bullet in section.bullets [
    - #bullet
  ]
]

== Technical Skills

#for cat in data.skills [
  #tech-stack(cat.category, cat.names.join(", "))
]

== Education

#for node in data.education [
  #block(above: 0.7em, below: 0.3em)[
    #text(fill: dark, weight: "bold")[#node.degree]
    #text(fill: light)[#h(0.6em) - #h(0.6em)#node.institution#if node.dates != "" [#h(0.6em) | #h(0.6em)#node.dates]]
  ]
  #if node.details.len() > 0 [
    #text(fill: light)[#emph[Relevant Coursework: #node.details.join(", ")]]
  ]
]

== Certifications

#for node in data.certifications [
  #bullet-line(text(fill: dark, node.name), if node.issuer != "" { text(fill: light, " — " + node.issuer) })
]

== Soft Skills

#for node in data.soft_skills [
  #bullet-line(text(fill: dark, weight: "bold", node.name), if node.detail != "" { text(fill: light, " — " + node.detail) })
]
