export type NodeBlock = {
  kind: 'code' | 'text' | 'md' | 'todo' | 'quote' | 'image' | 'pdf'
  language: string | null
  content: string
  checked: boolean
  pinned: boolean
}

export type OutlineNode = {
  id: string
  parentId: string | null
  order: number
  text: string
  createdAt: string
  updatedAt: string
  collapsed: boolean
  bold: boolean
  strike: boolean
  underline: boolean
  fontScale: number
  block: NodeBlock | null
}

export type OutlineMeta = {
  lastEditedId: string | null
  schemaVersion: 1
}

export type OutlineDocument = {
  nodes: OutlineNode[]
  meta: OutlineMeta
}

export type Roll = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  archived: boolean
  document: OutlineDocument
}

export type Workspace = {
  activeRollId: string
  rolls: Roll[]
}
