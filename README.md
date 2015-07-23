adapt-tincan
===============

An extension to track learner activity via TinCan/xAPI

# How to use (alpha)

This plugin is not yet officially supported by the Adapt project, and requires a couple of manual steps in order to use it effectively.

1. Add an extra grunt task in the Gruntfile for the framework:

````
// under the copy > main task, append after the copy of adapt-contrib-spoor/required
{
    expand: true,
    src: ['**/*'],
    dest: '<%= outputdir %>build/',
    cwd: 'src/extensions/adapt-tincan/required/'
}

````
2. Install the extension in your local version of the authoring tool via the plugin management menu
3. Create a new course and click "Manage Extensions" and enable the TinCan extension
4. The activityID for the module is currently hardcoded in the included tincan.xml, until support for writing this dynamically is added to the authoring tool. The current activityID is https://bitbucket.org/dennis-learningpool/adapt-tincan. You need to add this activity after enabling the extension on your authoring tool course by editing the TinCan section under Project Settings. If you choose a different activityID than the one above, be sure to hand edit the published zip and set the activityid attribute in the tincan.xml file bundled in the root of the published course.
5. Unzip your published course to some location on the web.
6. Install the moodle-mod_tincanlaunch activity on your Totara instance. (Use the development branch from github: https://github.com/garemoko/moodle-mod_tincanlaunch/tree/development)
7. Install and run an instance of Learning Locker (https://github.com/LearningLocker/learninglocker/)
8. Configuring the Learning Locker LRS is outside of the scope of this README
9. Add the learninglocker access keys to the plugin settings for the tincanlaunch activity
10. Add an instance of the tincanlaunch activity to a course and add the url to the location from step 5. above, and add the activity id that you chose.
11. You will also have to add the url "http://adlnet.gov/expapi/verbs/completed" as the verb that causes a completion under the activity settings, in order to have completions registered in your Totara course.
