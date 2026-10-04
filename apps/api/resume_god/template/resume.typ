// Static resume template for resume-god.
//
// Data comes from resume-data.json via file import — this template contains
// no Python interpolation. Python only writes and validates the JSON, then
// compiles this file. Rendered with @preview/basic-resume:0.2.9.
#import "@preview/basic-resume:0.2.9": *

#let plan = json("resume-data.json")
#let font-chain = (plan.font, "Carlito", "Liberation Sans", "DejaVu Sans")

#let dates(d) = if d.at("end", default: "") == "" or d.start == d.end {
  d.start + d.end
} else {
  dates-helper(start-date: d.start, end-date: d.end)
}

#show: resume.with(
  author: plan.contact.name,
  location: plan.contact.location,
  email: plan.contact.email,
  github: plan.contact.github,
  linkedin: plan.contact.linkedin,
  phone: plan.contact.phone,
  personal-site: plan.contact.personal_site,
  accent-color: "#26428b",
  font: font-chain,
  paper: "a4",
  author-position: center,
  personal-info-position: center,
)

#align(center)[*#plan.target_title*]

== Professional Summary

#plan.summary

== Technical Skills

#for cat in plan.skills [
- *#cat.category:* #cat.names.join(", ")
]

#let kinds = plan.sections.map(s => s.kind).dedup()
#for kind in kinds [
  == #(if kind == "experience" { "Work Experience" } else { "Projects" })
  #for section in plan.sections.filter(s => s.kind == kind) [
    #if kind == "experience" [
      #work(
        title: section.role,
        company: section.organization,
        location: section.location,
        dates: dates(section.dates),
      )
    ] else [
      #project(
        name: section.name,
        role: section.role,
        url: section.url,
        dates: dates(section.dates),
      )
    ]
    #for bullet in section.bullets [
- #bullet
    ]
  ]
]

== Education

#for node in plan.education [
  #edu(
    institution: node.institution,
    location: node.location,
    dates: dates(node.dates),
    degree: node.degree,
  )
  #for detail in node.details [
- #detail
  ]
]

#if plan.certifications.len() > 0 [
  == Certifications
  #for node in plan.certifications [
    #certificates(
      name: node.name,
      issuer: node.issuer,
      date: node.date,
    )
  ]
]
