adapt-contrib-xapi
===============

An extension to track learner activity via xAPI. Please note, this is a pre-alpha release and is not ready for production use.

# Requirements

* A Learning Record Store (LRS) - [LearningLocker](https://github.com/LearningLocker/learninglocker/) is recommended.

# How to Install

This plugin is not yet officially supported by the Adapt project, and requires a couple of manual steps in order to use it effectively.

1. From GitHub, click Download ZIP. This will download a file called adapt--contrib-xapi-master.zip file.
2. From within your authoring tool interface, click the top-left drop-down menu and select 'Plugin Management'.
3. Click 'Upload Plugin'.
4. Choose the adapt-contrib-xapi-master.zip file downloaded earlier.
5. Click 'Upload'.


# How to Use

1. Create a new course and click "Manage Extensions" and enable the xAPI extension
2. The activityID for the module (if unspecified) defaults to the URL where the published content is running.
    * You need to add this activity after enabling the extension on your authoring tool course by editing the xAPI section under Configuration Settings.
3. Unzip your published course to a location on the web.
4. Browse to the published course.
5. View LRS for xAPI statements.
