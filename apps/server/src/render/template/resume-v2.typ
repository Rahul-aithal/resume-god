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
#set text(font: (data.font, ..font-chain), size: size-normal, fill: mid, lang: "en")
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

#let separator = text(fill: light)[#h(0.6em) | #h(0.6em)]

// Profiles hold full URLs, bare domains, or handles.
#let as-url(value, base: "https://") = {
  if value.starts-with("http://") or value.starts-with("https://") { value } else { base + value }
}

#let role-header(company, title, location, dates) = {
  set text(size: size-normal)
  let parts = (
    if company != "" { text(fill: dark, weight: "bold", company) },
    if title != "" { text(fill: mid, emph(title)) },
    if location != "" { text(fill: light, location) },
    if dates != "" { text(fill: light, dates) },
  ).filter(part => part != none)
  block(above: 1em, below: 0.45em, parts.join(separator))
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
    head += link(as-url(url), url)
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

#{
  let parts = (
    if contact.location != "" { text(fill: light, contact.location) },
    if contact.phone != "" { text(fill: light, contact.phone) },
    if contact.email != "" { text(fill: light, contact.email) },
    if contact.linkedin != "" { link(as-url(contact.linkedin))[LinkedIn] },
    if contact.github != "" { link(as-url(contact.github, base: "https://github.com/"))[GitHub] },
    if contact.personal_site != "" { link(as-url(contact.personal_site))[Portfolio] },
  ).filter(part => part != none)
  block(above: 0pt, below: 0.6em, parts.join(separator))
}

// ---- sections ----

#let experience = data.sections.filter(s => s.kind == "experience")
#let projects = data.sections.filter(s => s.kind == "project")

#if data.summary != "" [
  == Summary

  #data.summary
]

#if experience.len() > 0 [
  == Experience

  #for section in experience [
    #role-header(section.organization, section.role, section.location, section.dates)
    #for bullet in section.bullets [
      - #bullet
    ]
  ]
]

#if projects.len() > 0 [
  == Projects

  #for section in projects [
    #project-header(section.name, section.tech_stack, section.dates, section.url)
    #for bullet in section.bullets [
      - #bullet
    ]
  ]
]

#if data.skills.len() > 0 [
  == Technical Skills

  #for cat in data.skills [
    #tech-stack(cat.category, cat.names.join(", "))
  ]
]

#if data.education.len() > 0 [
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
]

#if data.certifications.len() > 0 [
  == Certifications

  #for node in data.certifications [
    #bullet-line(text(fill: dark, node.name), if node.issuer != "" { text(fill: light, " — " + node.issuer) })
  ]
]

#if data.soft_skills.len() > 0 [
  == Soft Skills

  #for node in data.soft_skills [
    #bullet-line(text(fill: dark, weight: "bold", node.name), if node.detail != "" { text(fill: light, " — " + node.detail) })
  ]
]
