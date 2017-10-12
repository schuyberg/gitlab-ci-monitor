var onError = function (error) {
  this.loading = false


  this.onError = {message: "Something went wrong. Make sure the configuration is ok and your Gitlab is up and running: " + error}

  if (error.message == "Wrong format") {
    this.onError = {message: "Wrong projects format! Try: 'namespace/project' or 'namespace/project/branch'"}
  }

  if (error.message == 'Network Error') {
    this.onError = {message: "Network Error. Please check the Gitlab domain."}
  }

  if (error.response && error.response.status == 401) {
    this.onError = {message: "Unauthorized Access. Please check your token."}
  }
}

var app = new Vue({
  el: '#app',
  data: {
    projects: [],
    builds: [],
    token: null,
    gitlab: null,
    repositories: null,
    loading: false,
    invalidConfig: false,
    onError: null
  },
  computed: {
    sortedBuilds: function () {
      return this.builds.sort(function (a, b) {
        if (a.started < b.started) {
          return 1;
        }
        if (a.started > b.started) {
          return -1;
        }
        return 0;
      })
    }
  },
  created: function () {
    this.loadConfig()

    if (!this.configValid()) {
      this.invalidConfig = true;
      return
    }

    this.setupDefaults()

    this.fetchProjects()

    var self = this
    setInterval(function () {
      self.fetchBuilds()
    }, 60000)
  },
  methods: {
    loadConfig: function () {
      this.gitlab = 'git.library.ubc.ca'
      this.token = 'YOUR TOKEN HERE' 
      this.ref = getParameterByName("ref")

      repositories = [];

      this.repositories = []
      for (x in repositories) {
        try {
          repository = repositories[x].split('/')
          var namespace = repository[0].trim()
          var projectName = repository[1].trim()
          var nameWithNamespace = namespace + "/" + projectName
          var branch = "master"
          if (repository.length > 2) {
            branch = repository[2].trim()
          }
          this.repositories.push({
            nameWithNamespace: nameWithNamespace,
            projectName: projectName,
            branch: branch
          })
        }
        catch (err) {
          onError.bind(this)({message: "Wrong format", response: {status: 500}})
        }
      }
      ;
    },
    configValid: function () {
      valid = true
      if (this.repositories == null || this.token == null || this.gitlab == null) {
        valid = false
      }

      return valid
    },
    setupDefaults: function () {
      axios.defaults.baseURL = "https://" + this.gitlab + "/api/v3"
      axios.defaults.headers.common['PRIVATE-TOKEN'] = this.token
    },
    fetchProjects: function (page) {
      var self = this

    self.loading = true
    axios.get('/projects?order_by=last_activity_at&per_page=50')
      .then(function (response) {
        console.log(response)
        self.loading = false
        self.projects = response.data
        self.fetchBuilds()
      })
      .catch(onError.bind(self));
    },
    fetchBuilds: function () {
      var self = this
      this.projects.forEach(function (p) {
        axios.get('/projects/' + p.id + '/repository/branches')
          .then(function (response) {
            response.data.forEach(function(branch){
              lastCommit = branch.commit.id
              axios.get('/projects/' + p.id + '/repository/commits/' + lastCommit + '/builds')
                .then(function (response) {
                  updated = false

                  build = self.filterLastBuild(response.data)
                  if (!build) {
                    return
                  }

                  if (build.started_at === null) {
                    startedFromNow = 'Running';
                    build.status = 'running';
                    started = 100 * 100000000
                  } else {
                    startedFromNow = moment(build.started_at).fromNow()
                    started = moment(build.started_at).unix()
                  }
                  self.builds.forEach(function (b) {
                    if (b.project == p.name && b.branch == branch.name) {
                      updated = true

                      b.id = build.id
                      b.status = build.status
                      b.startedFromNow = startedFromNow,
                      b.started = started,
                      b.author = build.commit.author_name
                      b.project_path = p.path_with_namespace
                      b.branch = branch.name
                    }
                  });

                  if (!updated) {
                    self.builds.push({
                      project: p.name,
                      id: build.id,
                      status: build.status,
                      startedFromNow: startedFromNow,
                      started: started,
                      author: build.commit.author_name,
                      project_path: p.path_with_namespace,
                      branch: branch.name
                    })
                  }
                })
                .catch(onError.bind(self));
            })

          })
          .catch(onError.bind(self));
      })
    },

    filterLastBuild: function (builds) {
      if (!Array.isArray(builds) || builds.length === 0) {
        return
      }
      return builds[0]
    }
  }
})
