# Original idea (verbatim, 2026-11-06)

Owner's framing message:

> I have a new project in mind that is somewhat related to mmf ng. namely when it comes to the library of keyboard shortcuts. probably it doesn't make sense to combine the two apart from the library. let's brainstorm and think about how we could do this:

Pasted idea:

> alright, I want to build an app that helps me to build my muscle memory for macOS keyboard shortcuts for all the features and functionality for which I know the windows shortcut by heart.
> my plan is as follows: an app that is a key logger and which runs in the background on windows first. it listens to my key input and identifies whenever I use a shortcut. maybe in order to do that reliably, it needs to also know which app is currently in focus.
> and when I use a shortcut, say Win+E to open a windows explorer window, it recognizes Win+E and shows a little toast message in the bottom right that writes Win+E > Cmd+Space - finder.
>
> I want this app to be aware of the keyboard shortcuts that exist in apps today, and I want to be able to use it to teach me how to use the correct keyboard shortcuts when using macOS. Ultimately, what I might need is to have the app running on macOS in future and monitoring when I use Windows keyboard shortcuts that I was used to before. And then help me to see the correct macOS keyboard shortcut. How could we build such an app that works both on Windows and macOS and stores my utilized keyboards in a database, always as a combination of application plus shortcut and shortcut meaning? And to build a repository of the shortcuts that I use very often and that I need to learn to be able to use macOS efficiently.
