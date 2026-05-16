type Props = {
  preQaCaption?: string | null
}

export function QaEditedIndicator({ preQaCaption }: Props) {
  if (!preQaCaption) return null

  return (
    <p className="text-xs italic text-muted-foreground mt-1">
      Edited by QA bot
    </p>
  )
}
