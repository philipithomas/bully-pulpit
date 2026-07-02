export type SubscriberPreferences = {
  email: string
  subscribed_contraption: boolean
  subscribed_workshop: boolean
  subscribed_postcard: boolean
  subscribed_tsundoku: boolean
}

export type SubscriberPreferenceKey = Exclude<
  keyof SubscriberPreferences,
  'email'
>
